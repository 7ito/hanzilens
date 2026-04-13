import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, startParse } from '@/lib/api';
import { parseSseResponse } from '@/lib/parseSse';
import { createAbortError, isAbortError } from '@/lib/abort';
import type { ParseResponse, SentenceChunk } from '@/types';

const MAX_CONCURRENCY = 3;
const MAX_CONTEXT_LENGTH = 1500;
const INITIAL_PREFETCH_COUNT = 2;
const PREFETCH_AFTER_OPEN_COUNT = 2;
const MAX_PARSE_RETRIES = 2;
const BASE_RETRY_DELAY_MS = 450;
const MAX_RETRY_DELAY_MS = 5000;

interface SentenceParseQueueState {
  openSentenceIds: string[];
  sentences: SentenceChunk[];
  sentenceResults: Record<string, ParseResponse>;
  sentenceLoading: Record<string, boolean>;
  sentenceError: Record<string, string | null>;
}

interface InitializeQueueInput {
  combinedText: string;
  sentences: SentenceChunk[];
  sessionId?: number;
}

interface UseSentenceParseQueueResult extends SentenceParseQueueState {
  initialize: (input: InitializeQueueInput) => void;
  reset: () => number;
  selectSentence: (sentenceId: string) => void;
  isSessionActive: (sessionId: number) => boolean;
}

const initialState: SentenceParseQueueState = {
  openSentenceIds: [],
  sentences: [],
  sentenceResults: {},
  sentenceLoading: {},
  sentenceError: {},
};

function shouldRetry(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 429;
}

function getRetryDelayMs(attempt: number, retryAfterMs?: number): number {
  if (typeof retryAfterMs === 'number' && retryAfterMs > 0) {
    return Math.min(retryAfterMs, MAX_RETRY_DELAY_MS);
  }

  const exponentialBackoff = Math.min(MAX_RETRY_DELAY_MS, BASE_RETRY_DELAY_MS * 2 ** attempt);
  const jitter = Math.floor(Math.random() * 250);
  return exponentialBackoff + jitter;
}

function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(createAbortError());
      return;
    }

    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeoutId);
      signal.removeEventListener('abort', onAbort);
      reject(createAbortError());
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function buildSentenceContext(combinedText: string, sentence: SentenceChunk): string {
  if (!combinedText) return '';

  const rawContext = combinedText.slice(0, sentence.startOffset).trim();
  if (!rawContext) return '';
  if (rawContext.length <= MAX_CONTEXT_LENGTH) return rawContext;

  return rawContext.slice(rawContext.length - MAX_CONTEXT_LENGTH);
}

export function useSentenceParseQueue(): UseSentenceParseQueueResult {
  const [state, setState] = useState<SentenceParseQueueState>(initialState);
  const stateRef = useRef<SentenceParseQueueState>(initialState);
  const queueRef = useRef<string[]>([]);
  const inFlightRef = useRef(0);
  const inFlightSentenceIdsRef = useRef<Set<string>>(new Set());
  const sentenceControllersRef = useRef<Map<string, AbortController>>(new Map());
  const sentenceMapRef = useRef<Record<string, SentenceChunk>>({});
  const sentenceOrderRef = useRef<string[]>([]);
  const sentenceIndexRef = useRef<Record<string, number>>({});
  const userOpenedRef = useRef<Set<string>>(new Set());
  const sessionIdRef = useRef(0);
  const combinedTextRef = useRef('');

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const isSessionActive = useCallback((sessionId: number) => {
    return sessionIdRef.current === sessionId;
  }, []);

  const reset = useCallback(() => {
    sessionIdRef.current += 1;

    sentenceControllersRef.current.forEach((controller) => controller.abort());
    sentenceControllersRef.current.clear();

    setState(initialState);
    queueRef.current = [];
    inFlightRef.current = 0;
    inFlightSentenceIdsRef.current.clear();
    sentenceMapRef.current = {};
    sentenceOrderRef.current = [];
    sentenceIndexRef.current = {};
    userOpenedRef.current = new Set();
    combinedTextRef.current = '';

    return sessionIdRef.current;
  }, []);

  const enqueueSentence = useCallback((sentenceId: string, priority = false) => {
    const currentState = stateRef.current;
    if (
      currentState.sentenceResults[sentenceId] ||
      currentState.sentenceLoading[sentenceId] ||
      inFlightSentenceIdsRef.current.has(sentenceId)
    ) {
      return;
    }

    const existingIndex = queueRef.current.indexOf(sentenceId);
    if (existingIndex !== -1) {
      if (priority) {
        queueRef.current.splice(existingIndex, 1);
        queueRef.current.unshift(sentenceId);
      }
      return;
    }

    if (priority) {
      queueRef.current.unshift(sentenceId);
    } else {
      queueRef.current.push(sentenceId);
    }
  }, []);

  const prefetchFollowingSentences = useCallback((sentenceId: string) => {
    const sentenceIndex = sentenceIndexRef.current[sentenceId];
    if (!Number.isInteger(sentenceIndex)) return;

    for (let offset = 1; offset <= PREFETCH_AFTER_OPEN_COUNT; offset += 1) {
      const nextSentenceId = sentenceOrderRef.current[sentenceIndex + offset];
      if (!nextSentenceId) break;
      enqueueSentence(nextSentenceId);
    }
  }, [enqueueSentence]);

  const parseSentenceInternal = useCallback(async (sentenceId: string, sentence: SentenceChunk, sessionId: number) => {
    const controller = new AbortController();
    sentenceControllersRef.current.set(sentenceId, controller);

    setState((prev) => ({
      ...prev,
      sentenceLoading: { ...prev.sentenceLoading, [sentenceId]: true },
      sentenceError: { ...prev.sentenceError, [sentenceId]: null },
    }));

    try {
      const context = buildSentenceContext(combinedTextRef.current, sentence);
      let result: ParseResponse | null = null;

      const applyPartialResult = (partial: unknown) => {
        if (sessionIdRef.current !== sessionId || controller.signal.aborted) return;
        if (!partial || typeof partial !== 'object') return;

        const partialResult = partial as Partial<ParseResponse>;
        setState((prev) => {
          const existing = prev.sentenceResults[sentenceId] ?? {
            translation: '',
            segments: [],
            translationParts: [],
          };

          const nextTranslation =
            typeof partialResult.translation === 'string'
              ? partialResult.translation
              : existing.translation;
          const nextSegments = Array.isArray(partialResult.segments)
            ? partialResult.segments
            : existing.segments;

          if (existing.translation === nextTranslation && existing.segments === nextSegments) {
            return prev;
          }

          return {
            ...prev,
            sentenceResults: {
              ...prev.sentenceResults,
              [sentenceId]: {
                translation: nextTranslation,
                segments: nextSegments,
                translationParts: existing.translationParts,
              },
            },
          };
        });
      };

      for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt += 1) {
        try {
          const response = await startParse(
            { type: 'text', sentence: sentence.text, context },
            controller.signal
          );
          result = await parseSseResponse(response, {
            signal: controller.signal,
            onPartial: applyPartialResult,
          });
          break;
        } catch (error) {
          if (isAbortError(error)) {
            throw error;
          }

          const shouldRetryNow = shouldRetry(error) && attempt < MAX_PARSE_RETRIES;
          if (!shouldRetryNow) {
            throw error;
          }

          const delayMs = getRetryDelayMs(attempt, error.retryAfterMs);
          await sleepWithSignal(delayMs, controller.signal);
        }
      }

      if (!result) {
        throw new Error('Failed to parse sentence');
      }

      if (sessionIdRef.current !== sessionId) return;

      setState((prev) => ({
        ...prev,
        sentenceResults: { ...prev.sentenceResults, [sentenceId]: result },
      }));

      if (userOpenedRef.current.has(sentenceId)) {
        prefetchFollowingSentences(sentenceId);
      }
    } catch (error) {
      if (sessionIdRef.current !== sessionId) return;
      if (isAbortError(error)) return;

      const message = error instanceof Error ? error.message : 'Failed to parse sentence';
      setState((prev) => ({
        ...prev,
        sentenceError: { ...prev.sentenceError, [sentenceId]: message },
      }));
    } finally {
      if (sentenceControllersRef.current.get(sentenceId) === controller) {
        sentenceControllersRef.current.delete(sentenceId);
      }

      if (sessionIdRef.current === sessionId) {
        setState((prev) => ({
          ...prev,
          sentenceLoading: { ...prev.sentenceLoading, [sentenceId]: false },
        }));
      }
    }
  }, [prefetchFollowingSentences]);

  const runQueue = useCallback((sessionId: number) => {
    while (inFlightRef.current < MAX_CONCURRENCY && queueRef.current.length > 0) {
      const sentenceId = queueRef.current.shift();
      if (!sentenceId) break;

      const sentence = sentenceMapRef.current[sentenceId];
      if (!sentence) continue;
      if (inFlightSentenceIdsRef.current.has(sentenceId)) continue;
      if (sessionIdRef.current !== sessionId) return;

      inFlightRef.current += 1;
      inFlightSentenceIdsRef.current.add(sentenceId);

      void parseSentenceInternal(sentenceId, sentence, sessionId).finally(() => {
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        inFlightSentenceIdsRef.current.delete(sentenceId);
        runQueue(sessionId);
      });
    }
  }, [parseSentenceInternal]);

  const selectSentence = useCallback((sentenceId: string) => {
    const isOpen = stateRef.current.openSentenceIds.includes(sentenceId);

    setState((prev) => ({
      ...prev,
      openSentenceIds: isOpen
        ? prev.openSentenceIds.filter((id) => id !== sentenceId)
        : [...prev.openSentenceIds, sentenceId],
    }));

    if (isOpen) {
      return;
    }

    userOpenedRef.current.add(sentenceId);
    enqueueSentence(sentenceId, true);

    if (stateRef.current.sentenceResults[sentenceId]) {
      prefetchFollowingSentences(sentenceId);
    }

    runQueue(sessionIdRef.current);
  }, [enqueueSentence, prefetchFollowingSentences, runQueue]);

  const initialize = useCallback(({ combinedText, sentences, sessionId }: InitializeQueueInput) => {
    if (typeof sessionId === 'number' && sessionIdRef.current !== sessionId) {
      return;
    }

    const activeSessionId = sessionIdRef.current;

    combinedTextRef.current = combinedText;

    const sentenceMap: Record<string, SentenceChunk> = {};
    const sentenceOrder = sentences.map((sentence) => sentence.id);
    const sentenceIndex: Record<string, number> = {};

    sentences.forEach((sentence, index) => {
      sentenceMap[sentence.id] = sentence;
      sentenceIndex[sentence.id] = index;
    });

    sentenceMapRef.current = sentenceMap;
    sentenceOrderRef.current = sentenceOrder;
    sentenceIndexRef.current = sentenceIndex;
    userOpenedRef.current = new Set();
    queueRef.current = [];
    inFlightRef.current = 0;
    inFlightSentenceIdsRef.current.clear();

    const initiallyOpenSentenceIds = sentenceOrder.length > 0 ? [sentenceOrder[0]] : [];

    setState((prev) => ({
      ...prev,
      sentences,
      openSentenceIds: initiallyOpenSentenceIds,
      sentenceResults: {},
      sentenceLoading: {},
      sentenceError: {},
    }));

    sentenceOrder.slice(0, INITIAL_PREFETCH_COUNT).forEach((sentenceId) => {
      enqueueSentence(sentenceId);
    });

    runQueue(activeSessionId);
  }, [enqueueSentence, runQueue]);

  return {
    ...state,
    initialize,
    reset,
    selectSentence,
    isSessionActive,
  };
}
