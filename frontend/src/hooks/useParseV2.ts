import { useState, useCallback, useRef } from 'react';
import { startParseV2 } from '@/lib/api';
import { parseSseV2Response } from '@/lib/parseSseV2';
import { isAbortError } from '@/lib/abort';
import type {
  GrammarPoint,
  ParsedSegment,
  ProvisionalSegment,
  TranslationPart,
} from '@/types';

/** A display segment: LLM-confirmed, or a provisional placeholder (rendered muted) */
export interface DisplaySegment extends ParsedSegment {
  provisional?: boolean;
}

/** Timing milestones of the current parse, in ms since submit */
export interface ParseV2Timings {
  provisionalMs: number | null;
  firstLlmMs: number | null;
  totalMs: number | null;
}

interface ParseV2State {
  isLoading: boolean;
  error: string | null;
  translation: string;
  translationParts: TranslationPart[];
  segments: DisplaySegment[];
  grammarPoints: GrammarPoint[];
  timings: ParseV2Timings;
}

interface UseParseV2Result extends ParseV2State {
  parse: (sentence: string, context?: string) => Promise<void>;
  reset: () => void;
}

const initialState: ParseV2State = {
  isLoading: false,
  error: null,
  translation: '',
  translationParts: [],
  segments: [],
  grammarPoints: [],
  timings: { provisionalMs: null, firstLlmMs: null, totalMs: null },
};

interface StreamPartial {
  translation?: string;
  segments?: ParsedSegment[];
}

// Provisional ids are offset to avoid colliding with LLM segment ids (0..n)
const PROVISIONAL_ID_OFFSET = 100_000;

/**
 * Merge streaming LLM segments with the provisional skeleton.
 *
 * LLM segments cover the sentence in order; compute the character offset they
 * have consumed so far, then append the provisional segments that start at or
 * beyond it. A provisional word straddling the boundary is dropped (its
 * replacement is mid-stream) to avoid showing duplicated characters.
 */
function mergeSegments(
  sentence: string,
  llmSegments: ParsedSegment[],
  provisional: ProvisionalSegment[]
): DisplaySegment[] {
  if (llmSegments.length === 0) {
    return provisional.map((seg) => ({
      ...seg,
      id: seg.id + PROVISIONAL_ID_OFFSET,
      provisional: true,
    }));
  }

  // Walk the sentence to find the end offset of the last LLM token
  let consumedEnd = 0;
  for (const seg of llmSegments) {
    if (!seg.token) continue;
    const pos = sentence.indexOf(seg.token, consumedEnd);
    if (pos === -1) break;
    consumedEnd = pos + seg.token.length;
  }

  const remainder = provisional
    .filter((seg) => seg.startOffset >= consumedEnd)
    .map((seg) => ({
      ...seg,
      id: seg.id + PROVISIONAL_ID_OFFSET,
      provisional: true,
    }));

  return [...llmSegments, ...remainder];
}

/**
 * Hook for parsing Chinese sentences via the v2 pipeline (/parse2).
 *
 * Renders provisional CEDICT segments within milliseconds, replaces them
 * progressively as LLM segments stream in, and exposes hydrated grammar
 * points plus timing milestones for v1/v2 comparison.
 */
export function useParseV2(): UseParseV2Result {
  const [state, setState] = useState<ParseV2State>(initialState);
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    requestIdRef.current += 1;
    setState(initialState);
  }, []);

  const parse = useCallback(async (sentence: string, context?: string) => {
    reset();
    const requestId = requestIdRef.current;

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    const startTime = performance.now();
    const elapsed = () => Math.round(performance.now() - startTime);
    let provisionalSegments: ProvisionalSegment[] = [];

    try {
      const response = await startParseV2(sentence, context, controller.signal);

      const final = await parseSseV2Response(response, {
        signal: controller.signal,
        onProvisional: (segments) => {
          if (requestIdRef.current !== requestId) return;
          provisionalSegments = segments;
          setState((prev) => ({
            ...prev,
            segments: mergeSegments(sentence, [], segments),
            timings: { ...prev.timings, provisionalMs: elapsed() },
          }));
        },
        onPartial: (partial) => {
          if (requestIdRef.current !== requestId) return;
          if (!partial || typeof partial !== 'object') return;

          const { segments, translation } = partial as StreamPartial;
          setState((prev) => ({
            ...prev,
            segments: Array.isArray(segments)
              ? mergeSegments(sentence, segments, provisionalSegments)
              : prev.segments,
            translation: typeof translation === 'string' ? translation : prev.translation,
            timings:
              prev.timings.firstLlmMs === null
                ? { ...prev.timings, firstLlmMs: elapsed() }
                : prev.timings,
          }));
        },
        onGrammar: (grammarPoints) => {
          if (requestIdRef.current !== requestId) return;
          setState((prev) => ({ ...prev, grammarPoints }));
        },
      });

      if (requestIdRef.current !== requestId) return;

      setState((prev) => ({
        ...prev,
        segments: final.segments,
        translation: final.translation,
        translationParts: final.translationParts,
        grammarPoints: final.grammarPoints,
        isLoading: false,
        timings: { ...prev.timings, totalMs: elapsed() },
      }));
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      if (isAbortError(error)) return;

      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to parse',
      }));
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
