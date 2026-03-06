import { useState, useCallback, useRef } from 'react';
import posthog from 'posthog-js';
import { startParse } from '@/lib/api';
import { parseSseResponse } from '@/lib/parseSse';
import { isAbortError } from '@/lib/abort';
import { AnalyticsEvents } from '@/hooks/useAnalytics';
import type { ParsedSegment, TranslationPart, ParseInput } from '@/types';

interface ParseState {
  isLoading: boolean;
  error: string | null;
  translation: string;
  translationParts: TranslationPart[];
  segments: ParsedSegment[];
}

interface UseParseResult extends ParseState {
  parse: (input: ParseInput) => Promise<void>;
  reset: () => void;
}

const initialState: ParseState = {
  isLoading: false,
  error: null,
  translation: '',
  translationParts: [],
  segments: [],
};

interface StreamParseResult {
  translation?: string;
  segments?: ParsedSegment[];
  translationParts?: TranslationPart[];
  error?: string;
  message?: string;
}

/**
 * Hook for parsing Chinese sentences via SSE streaming.
 * Progressively updates segments as they stream in.
 */
export function useParse(): UseParseResult {
  const [state, setState] = useState<ParseState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const reset = useCallback(() => {
    // Abort any in-progress request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    requestIdRef.current += 1;
    setState(initialState);
  }, []);

  const parse = useCallback(async (input: ParseInput) => {
    // Reset state and abort previous request
    reset();
    const requestId = requestIdRef.current;

    // Create new abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const startTime = performance.now();

    try {
      const response = await startParse(input, controller.signal);

      const final = (await parseSseResponse(response, {
        signal: controller.signal,
        onPartial: (partial) => {
          if (requestIdRef.current !== requestId) return;
          if (!partial || typeof partial !== 'object') return;

          const partialResult = partial as StreamParseResult;
          setState((prev) => ({
            ...prev,
            segments: Array.isArray(partialResult.segments) ? partialResult.segments : prev.segments,
            translation:
              typeof partialResult.translation === 'string'
                ? partialResult.translation
                : prev.translation,
          }));
        },
      })) as StreamParseResult;

      if (requestIdRef.current !== requestId) return;

      if (final.error === 'no_chinese_text') {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: final.message || 'No Chinese text found in image',
        }));

        posthog.capture(AnalyticsEvents.PARSE_FAILED, {
          error: 'no_chinese_text',
          duration_ms: Math.round(performance.now() - startTime),
        });
        return;
      }

      setState((prev) => ({
        ...prev,
        segments: Array.isArray(final.segments) ? final.segments : prev.segments,
        translation: typeof final.translation === 'string' ? final.translation : prev.translation,
        translationParts: Array.isArray(final.translationParts)
          ? final.translationParts
          : prev.translationParts,
        isLoading: false,
      }));

      posthog.capture(AnalyticsEvents.PARSE_COMPLETED, {
        segment_count: final.segments?.length || 0,
        has_translation: !!final.translation,
        duration_ms: Math.round(performance.now() - startTime),
      });
    } catch (error) {
      if (requestIdRef.current !== requestId) return;

      if (isAbortError(error)) {
        // Request was aborted, ignore
        return;
      }

      const errorMessage = error instanceof Error ? error.message : 'Failed to parse';
      
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      
      // Track parse failure
      posthog.capture(AnalyticsEvents.PARSE_FAILED, {
        error: errorMessage,
        duration_ms: Math.round(performance.now() - startTime),
      });
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [reset]);

  return {
    ...state,
    parse,
    reset,
  };
}
