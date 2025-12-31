import { useState, useCallback, useRef } from 'react';
import { IncompleteJsonParser } from 'incomplete-json-parser';
import { startParse } from '@/lib/api';
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

/**
 * Hook for parsing Chinese sentences via SSE streaming.
 * Progressively updates segments as they stream in.
 */
export function useParse(): UseParseResult {
  const [state, setState] = useState<ParseState>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    // Abort any in-progress request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState(initialState);
  }, []);

  const parse = useCallback(async (input: ParseInput) => {
    // Reset state and abort previous request
    reset();

    // Create new abort controller
    abortControllerRef.current = new AbortController();

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    let contentBuffer = '';

    try {
      const response = await startParse(input);

      if (!response.body) {
        throw new Error('No response body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          // Final parse of complete JSON
          try {
            const final = JSON.parse(contentBuffer);
            
            // Check for "no Chinese text" error from vision model
            if (final.error === 'no_chinese_text') {
              setState((prev) => ({
                ...prev,
                isLoading: false,
                error: final.message || 'No Chinese text found in image',
              }));
              break;
            }
            
            setState((prev) => ({
              ...prev,
              segments: final.segments || prev.segments,
              translation: final.translation || prev.translation,
              // Only set translationParts from final response (not during streaming)
              translationParts: Array.isArray(final.translationParts)
                ? final.translationParts
                : prev.translationParts,
              isLoading: false,
            }));
          } catch {
            // If final parse fails, keep what we have
            setState((prev) => ({ ...prev, isLoading: false }));
          }
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        while (true) {
          const lineEnd = buffer.indexOf('\n');
          if (lineEnd === -1) break;

          const line = buffer.slice(0, lineEnd).trim();
          buffer = buffer.slice(lineEnd + 1);

          if (line.startsWith('data: ')) {
            const data = line.slice(6);

            if (data === '[DONE]') {
              continue;
            }

            try {
              const parsed = JSON.parse(data);

              // Handle streaming chunks
              if (parsed.choices?.[0]?.delta?.content) {
                contentBuffer += parsed.choices[0].delta.content;

                // Try to parse incomplete JSON for progressive updates
                try {
                  const partial = IncompleteJsonParser.parse(contentBuffer);

                  if (partial && typeof partial === 'object') {
                    setState((prev) => ({
                      ...prev,
                      segments: Array.isArray(partial.segments)
                        ? partial.segments
                        : prev.segments,
                      translation:
                        typeof partial.translation === 'string'
                          ? partial.translation
                          : prev.translation,
                    }));
                  }
                } catch {
                  // Incomplete JSON not parseable yet, continue
                }
              }
            } catch {
              // Skip unparseable lines
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Request was aborted, ignore
        return;
      }

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to parse',
      }));
    } finally {
      abortControllerRef.current = null;
    }
  }, [reset]);

  return {
    ...state,
    parse,
    reset,
  };
}
