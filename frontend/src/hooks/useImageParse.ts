import { useCallback, useRef, useState } from 'react';
import { startOcr } from '@/lib/api';
import { useSentenceParseQueue } from '@/hooks/useSentenceParseQueue';
import { isAbortError } from '@/lib/abort';
import { splitCombinedTextIntoSentences } from '@/lib/sentenceSplit';
import type { OcrResult } from '@/types';

interface ImageParseState {
  isLoadingOcr: boolean;
  ocrError: string | null;
  ocrResult: OcrResult | null;
}

const initialState: ImageParseState = {
  isLoadingOcr: false,
  ocrError: null,
  ocrResult: null,
};

export function useImageParse() {
  const [state, setState] = useState<ImageParseState>(initialState);
  const ocrControllerRef = useRef<AbortController | null>(null);
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
    if (ocrControllerRef.current) {
      ocrControllerRef.current.abort();
      ocrControllerRef.current = null;
    }

    resetQueue();
    setState(initialState);
  }, [resetQueue]);

  const start = useCallback(async (image: string) => {
    if (ocrControllerRef.current) {
      ocrControllerRef.current.abort();
      ocrControllerRef.current = null;
    }

    const sessionId = resetQueue();
    setState({ isLoadingOcr: true, ocrError: null, ocrResult: null });

    const ocrController = new AbortController();
    ocrControllerRef.current = ocrController;

    try {
      const result = await startOcr(image, ocrController.signal);
      if (!isSessionActive(sessionId)) return;

      const combinedText = result.lines.map((line) => line.text).join('\n');
      const parsedSentences = splitCombinedTextIntoSentences(combinedText);

      initialize({
        combinedText,
        sentences: parsedSentences,
        sessionId,
      });

      setState((prev) => ({ ...prev, ocrResult: result }));
    } catch (error) {
      if (!isSessionActive(sessionId)) return;
      if (isAbortError(error)) return;

      const message = error instanceof Error ? error.message : 'Failed to extract text from image';
      setState((prev) => ({ ...prev, ocrError: message }));
    } finally {
      if (ocrControllerRef.current === ocrController) {
        ocrControllerRef.current = null;
      }

      if (isSessionActive(sessionId)) {
        setState((prev) => ({ ...prev, isLoadingOcr: false }));
      }
    }
  }, [initialize, isSessionActive, resetQueue]);

  return {
    isLoadingOcr: state.isLoadingOcr,
    ocrError: state.ocrError,
    ocrResult: state.ocrResult,
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
