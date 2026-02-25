import { useCallback, useState } from 'react';
import { useSentenceParseQueue } from '@/hooks/useSentenceParseQueue';
import { splitCombinedTextIntoSentences } from '@/lib/sentenceSplit';
import type { SentenceChunk } from '@/types';

interface ParagraphParseState {
  isPreparing: boolean;
  error: string | null;
}

const initialState: ParagraphParseState = {
  isPreparing: false,
  error: null,
};

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
  const {
    openSentenceIds,
    sentences,
    sentenceResults,
    sentenceLoading,
    sentenceError,
    initialize,
    reset: resetQueue,
    selectSentence,
    isSessionActive,
  } = useSentenceParseQueue();

  const reset = useCallback(() => {
    resetQueue();
    setState(initialState);
  }, [resetQueue]);

  const start = useCallback(async (text: string) => {
    const sessionId = resetQueue();
    setState({ isPreparing: true, error: null });

    try {
      const combinedText = text.trim();
      if (!combinedText) {
        if (isSessionActive(sessionId)) {
          setState((prev) => ({ ...prev, error: 'Text cannot be empty' }));
        }
        return;
      }

      let parsedSentences = splitCombinedTextIntoSentences(combinedText);
      if (parsedSentences.length === 0) {
        parsedSentences = [ensureSingleChunk(combinedText)];
      }

      initialize({
        combinedText,
        sentences: parsedSentences,
        sessionId,
      });
    } catch (error) {
      if (!isSessionActive(sessionId)) return;

      const message = error instanceof Error ? error.message : 'Failed to parse text';
      setState((prev) => ({ ...prev, error: message }));
    } finally {
      if (isSessionActive(sessionId)) {
        setState((prev) => ({ ...prev, isPreparing: false }));
      }
    }
  }, [initialize, isSessionActive, resetQueue]);

  return {
    isPreparing: state.isPreparing,
    error: state.error,
    openSentenceIds,
    sentences,
    sentenceResults,
    sentenceLoading,
    sentenceError,
    start,
    reset,
    selectSentence,
  };
}
