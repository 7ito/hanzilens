import { useCallback, useEffect, useRef, useState } from 'react';
import { startParse } from '@/lib/api';
import { parseSseResponse } from '@/lib/parseSse';
import { splitCombinedTextIntoSentences } from '@/lib/sentenceSplit';
import type { ParseResponse, SentenceChunk } from '@/types';

interface ParagraphParseState {
  isPreparing: boolean;
  error: string | null;
  openSentenceIds: string[];
  sentences: SentenceChunk[];
  sentenceResults: Record<string, ParseResponse>;
  sentenceLoading: Record<string, boolean>;
  sentenceError: Record<string, string | null>;
}

const initialState: ParagraphParseState = {
  isPreparing: false,
  error: null,
  openSentenceIds: [],
  sentences: [],
  sentenceResults: {},
  sentenceLoading: {},
  sentenceError: {},
};

const MAX_CONCURRENCY = 3;
const MAX_CONTEXT_LENGTH = 1500;

function buildSentenceContext(combinedText: string, sentence: SentenceChunk): string {
  if (!combinedText) return '';
  const rawContext = combinedText.slice(0, sentence.endOffset).trim();
  if (!rawContext) return '';
  if (rawContext.length <= MAX_CONTEXT_LENGTH) return rawContext;
  return rawContext.slice(rawContext.length - MAX_CONTEXT_LENGTH);
}

function ensureSingleChunk(text: string): SentenceChunk {
  const trimmed = text.trim();
  return {
    id: 'sentence-1',
    text: trimmed,
    startOffset: text.indexOf(trimmed),
    endOffset: text.indexOf(trimmed) + trimmed.length,
  };
}

export function useParagraphParse() {
  const [state, setState] = useState<ParagraphParseState>(initialState);
  const stateRef = useRef<ParagraphParseState>(initialState);
  const queueRef = useRef<string[]>([]);
  const inFlightRef = useRef(0);
  const sentenceMapRef = useRef<Record<string, SentenceChunk>>({});
  const sessionIdRef = useRef(0);
  const combinedTextRef = useRef('');

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const reset = useCallback(() => {
    setState(initialState);
    queueRef.current = [];
    inFlightRef.current = 0;
    sentenceMapRef.current = {};
    combinedTextRef.current = '';
  }, []);

  const parseSentenceInternal = useCallback(async (sentenceId: string, sentence: SentenceChunk, sessionId: number) => {
    setState((prev) => ({
      ...prev,
      sentenceLoading: { ...prev.sentenceLoading, [sentenceId]: true },
      sentenceError: { ...prev.sentenceError, [sentenceId]: null },
    }));

    try {
      const context = buildSentenceContext(combinedTextRef.current, sentence);
      const response = await startParse({ type: 'text', sentence: sentence.text, context });
      const result = await parseSseResponse(response);

      if (sessionIdRef.current !== sessionId) return;

      setState((prev) => ({
        ...prev,
        sentenceResults: { ...prev.sentenceResults, [sentenceId]: result },
      }));
    } catch (error) {
      if (sessionIdRef.current !== sessionId) return;

      const message = error instanceof Error ? error.message : 'Failed to parse sentence';
      setState((prev) => ({
        ...prev,
        sentenceError: { ...prev.sentenceError, [sentenceId]: message },
      }));
    } finally {
      if (sessionIdRef.current !== sessionId) return;
      setState((prev) => ({
        ...prev,
        sentenceLoading: { ...prev.sentenceLoading, [sentenceId]: false },
      }));
    }
  }, []);

  const runQueue = useCallback((sessionId: number) => {
    while (inFlightRef.current < MAX_CONCURRENCY && queueRef.current.length > 0) {
      const sentenceId = queueRef.current.shift();
      if (!sentenceId) break;
      const sentence = sentenceMapRef.current[sentenceId];
      if (!sentence) continue;
      if (sessionIdRef.current !== sessionId) return;

      inFlightRef.current += 1;
      void parseSentenceInternal(sentenceId, sentence, sessionId).finally(() => {
        inFlightRef.current -= 1;
        runQueue(sessionId);
      });
    }
  }, [parseSentenceInternal]);

  const enqueueSentence = useCallback((sentenceId: string, priority = false) => {
    const currentState = stateRef.current;
    if (currentState.sentenceResults[sentenceId] || currentState.sentenceLoading[sentenceId]) {
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

  const selectSentence = useCallback((sentenceId: string) => {
    const isOpen = stateRef.current.openSentenceIds.includes(sentenceId);

    setState((prev) => ({
      ...prev,
      openSentenceIds: isOpen
        ? prev.openSentenceIds.filter((id) => id !== sentenceId)
        : [...prev.openSentenceIds, sentenceId],
    }));

    if (!isOpen) {
      enqueueSentence(sentenceId, true);
      runQueue(sessionIdRef.current);
    }
  }, [enqueueSentence, runQueue]);

  const start = useCallback(async (text: string) => {
    reset();
    setState((prev) => ({ ...prev, isPreparing: true, error: null }));
    sessionIdRef.current += 1;
    const sessionId = sessionIdRef.current;

    try {
      const combinedText = text.trim();
      if (!combinedText) {
        setState((prev) => ({ ...prev, error: 'Text cannot be empty' }));
        return;
      }

      combinedTextRef.current = combinedText;
      let sentences = splitCombinedTextIntoSentences(combinedText);
      if (sentences.length === 0) {
        sentences = [ensureSingleChunk(combinedText)];
      }

      const sentenceMap: Record<string, SentenceChunk> = {};
      sentences.forEach((sentence) => {
        sentenceMap[sentence.id] = sentence;
      });
      sentenceMapRef.current = sentenceMap;
      queueRef.current = [];
      inFlightRef.current = 0;

      setState((prev) => ({
        ...prev,
        sentences,
        openSentenceIds: [],
      }));

      sentences.forEach((sentence) => enqueueSentence(sentence.id));
      runQueue(sessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to parse text';
      setState((prev) => ({ ...prev, error: message }));
    } finally {
      setState((prev) => ({ ...prev, isPreparing: false }));
    }
  }, [enqueueSentence, reset, runQueue]);

  return {
    ...state,
    start,
    reset,
    selectSentence,
  };
}
