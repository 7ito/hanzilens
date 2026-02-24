import { useCallback, useEffect, useRef, useState } from 'react';
import { startOcr, startParse } from '@/lib/api';
import type { OcrResult, ParseResponse, SentenceChunk } from '@/types';

interface ImageParseState {
  isLoadingOcr: boolean;
  ocrError: string | null;
  ocrResult: OcrResult | null;
  openSentenceIds: string[];
  sentences: SentenceChunk[];
  sentenceResults: Record<string, ParseResponse>;
  sentenceLoading: Record<string, boolean>;
  sentenceError: Record<string, string | null>;
}

const initialState: ImageParseState = {
  isLoadingOcr: false,
  ocrError: null,
  ocrResult: null,
  openSentenceIds: [],
  sentences: [],
  sentenceResults: {},
  sentenceLoading: {},
  sentenceError: {},
};

const HARD_BREAKS = new Set(['。', '！', '？', '；', '!', '?', ';', '…']);
const MAX_CONCURRENCY = 3;
const PUNCTUATION_ONLY_REGEX = /^[\s\p{P}\p{S}]+$/u;
const PUNCTUATION_CHAR_REGEX = /[\p{P}\p{S}]/u;

function isPunctuationOnly(text: string): boolean {
  const trimmed = text.trim();
  return !!trimmed && PUNCTUATION_ONLY_REGEX.test(trimmed);
}

function isPunctuationChar(char: string): boolean {
  return PUNCTUATION_CHAR_REGEX.test(char);
}

function isListMarkerAt(text: string, index: number): number | null {
  if (index < 0 || index >= text.length) return null;
  if (!/\d/.test(text[index])) return null;

  let j = index;
  while (j < text.length && /\d/.test(text[j])) {
    j += 1;
  }

  if (text[j] === '、') {
    return j + 1;
  }

  return null;
}

function splitCombinedTextIntoSentences(combinedText: string): SentenceChunk[] {
  if (!combinedText) return [];

  const chunks: SentenceChunk[] = [];
  let start = 0;
  let chunkIndex = 0;
  let pendingPrefix = '';
  let pendingStart = 0;
  let pendingEnd = 0;

  const addChunk = (chunkStart: number, chunkEnd: number) => {
    if (chunkEnd <= chunkStart) return;
    const raw = combinedText.slice(chunkStart, chunkEnd);
    const trimmed = raw.trim();
    if (!trimmed) return;

    const trimStartOffset = raw.indexOf(trimmed);
    let actualStart = chunkStart + (trimStartOffset >= 0 ? trimStartOffset : 0);
    let actualEnd = actualStart + trimmed.length;
    let normalizedText = trimmed.replace(/\s+/g, ' ');

    if (isPunctuationOnly(normalizedText)) {
      if (chunks.length > 0) {
        const prev = chunks[chunks.length - 1];
        prev.text = `${prev.text}${normalizedText}`;
        prev.endOffset = Math.max(prev.endOffset, actualEnd);
      } else {
        if (!pendingPrefix) {
          pendingStart = actualStart;
          pendingEnd = actualEnd;
        } else {
          pendingEnd = actualEnd;
        }
        pendingPrefix = `${pendingPrefix}${normalizedText}`;
      }
      return;
    }

    if (pendingPrefix) {
      normalizedText = `${pendingPrefix}${normalizedText}`;
      actualStart = pendingStart;
      pendingPrefix = '';
      pendingEnd = 0;
    }

    chunks.push({
      id: `sentence-${chunkIndex + 1}`,
      text: normalizedText,
      startOffset: actualStart,
      endOffset: actualEnd,
    });
    chunkIndex += 1;
  };

  for (let i = 0; i < combinedText.length; i += 1) {
    const listMarkerEnd = i > start ? isListMarkerAt(combinedText, i) : null;
    if (listMarkerEnd !== null) {
      addChunk(start, i);
      start = i;
      continue;
    }

    const char = combinedText[i];
    if (HARD_BREAKS.has(char)) {
      let end = i + 1;
      while (end < combinedText.length && isPunctuationChar(combinedText[end])) {
        end += 1;
      }
      addChunk(start, end);
      start = end;
      i = end - 1;
    }
  }

  if (start < combinedText.length) {
    addChunk(start, combinedText.length);
  }

  if (pendingPrefix && chunks.length > 0) {
    const last = chunks[chunks.length - 1];
    last.text = `${last.text}${pendingPrefix}`;
    last.endOffset = Math.max(last.endOffset, pendingEnd);
  }

  return chunks;
}

async function parseSseResponse(response: Response): Promise<ParseResponse> {
  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let contentBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const lineEnd = buffer.indexOf('\n');
      if (lineEnd === -1) break;

      const line = buffer.slice(0, lineEnd).trim();
      buffer = buffer.slice(lineEnd + 1);

      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) {
          contentBuffer += delta;
        }
      } catch {
        // Ignore malformed SSE chunks
      }
    }
  }

  if (!contentBuffer) {
    throw new Error('Empty response from parse');
  }

  return JSON.parse(contentBuffer) as ParseResponse;
}

export function useImageParse() {
  const [state, setState] = useState<ImageParseState>(initialState);
  const stateRef = useRef<ImageParseState>(initialState);
  const queueRef = useRef<string[]>([]);
  const inFlightRef = useRef(0);
  const sentenceMapRef = useRef<Record<string, SentenceChunk>>({});
  const sessionIdRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const reset = useCallback(() => {
    setState(initialState);
    queueRef.current = [];
    inFlightRef.current = 0;
    sentenceMapRef.current = {};
  }, []);

  const parseSentenceInternal = useCallback(async (sentenceId: string, sentence: SentenceChunk, sessionId: number) => {
    setState((prev) => ({
      ...prev,
      sentenceLoading: { ...prev.sentenceLoading, [sentenceId]: true },
      sentenceError: { ...prev.sentenceError, [sentenceId]: null },
    }));

    try {
      const response = await startParse({ type: 'text', sentence: sentence.text });
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

  const start = useCallback(async (image: string) => {
    reset();
    setState((prev) => ({ ...prev, isLoadingOcr: true, ocrError: null }));
    sessionIdRef.current += 1;
    const sessionId = sessionIdRef.current;

    try {
      const result = await startOcr(image);
      const combinedText = result.lines.map((line) => line.text).join('\n');
      const sentences = splitCombinedTextIntoSentences(combinedText);
      const sentenceMap: Record<string, SentenceChunk> = {};
      sentences.forEach((sentence) => {
        sentenceMap[sentence.id] = sentence;
      });
      sentenceMapRef.current = sentenceMap;
      queueRef.current = [];
      inFlightRef.current = 0;

      setState((prev) => ({
        ...prev,
        ocrResult: result,
        sentences,
        openSentenceIds: [],
      }));

      sentences.forEach((sentence) => enqueueSentence(sentence.id));
      runQueue(sessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to extract text from image';
      setState((prev) => ({ ...prev, ocrError: message }));
    } finally {
      setState((prev) => ({ ...prev, isLoadingOcr: false }));
    }
  }, [enqueueSentence, reset, runQueue]);

  return {
    ...state,
    start,
    reset,
    selectSentence,
  };
}
