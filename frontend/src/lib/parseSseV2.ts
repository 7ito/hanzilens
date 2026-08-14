/**
 * SSE parser for the v2 parse pipeline (/parse2).
 *
 * The v2 protocol is the v1 delta stream plus named events:
 *   event: provisional   data: { "segments": [...] }     (instant first paint)
 *   data: {"choices":[{"delta":{"content":"..."}}]}      (v1-compatible deltas)
 *   event: grammar       data: { "grammarPoints": [...] } (hydrated, at end)
 *   event: error         data: { "message": "..." }
 *   data: [DONE]
 */

import { IncompleteJsonParser } from 'incomplete-json-parser';
import { createAbortError } from '@/lib/abort';
import { validateParseResponse, isValidPartialResponse } from '@/lib/validation';
import type { GrammarPoint, ParseResponse, ProvisionalSegment } from '@/types';

interface ParseSseV2Options {
  signal?: AbortSignal;
  onProvisional?: (segments: ProvisionalSegment[]) => void;
  onPartial?: (partial: unknown) => void;
  onGrammar?: (grammarPoints: GrammarPoint[]) => void;
}

export interface ParseV2Result extends ParseResponse {
  grammarPoints: GrammarPoint[];
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function isValidProvisionalSegment(value: unknown): value is ProvisionalSegment {
  if (typeof value !== 'object' || value === null) return false;
  const seg = value as Record<string, unknown>;
  return (
    typeof seg.id === 'number' &&
    typeof seg.token === 'string' &&
    typeof seg.pinyin === 'string' &&
    typeof seg.definition === 'string' &&
    typeof seg.startOffset === 'number'
  );
}

function isValidGrammarRole(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const role = value as Record<string, unknown>;
  return (
    typeof role.key === 'string' &&
    typeof role.label === 'string' &&
    Array.isArray(role.segmentIds) &&
    role.segmentIds.every((id: unknown) => typeof id === 'number')
  );
}

function isValidGrammarPoint(value: unknown): value is GrammarPoint {
  if (typeof value !== 'object' || value === null) return false;
  const point = value as Record<string, unknown>;
  return (
    typeof point.patternId === 'string' &&
    Array.isArray(point.roles) &&
    point.roles.length > 0 &&
    point.roles.every(isValidGrammarRole) &&
    typeof point.name === 'string' &&
    typeof point.template === 'string' &&
    typeof point.explanation === 'string' &&
    typeof point.level === 'string'
  );
}

function extractDeltaContent(data: string): string | null {
  try {
    const parsed = JSON.parse(data);
    const delta = parsed?.choices?.[0]?.delta?.content;
    return typeof delta === 'string' ? delta : null;
  } catch {
    return null;
  }
}

export async function parseSseV2Response(
  response: Response,
  options: ParseSseV2Options = {}
): Promise<ParseV2Result> {
  const { signal, onProvisional, onPartial, onGrammar } = options;

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let contentBuffer = '';
  let grammarPoints: GrammarPoint[] = [];
  // Name from the most recent "event:" line; applies to the next "data:" line
  let pendingEventName: string | null = null;

  const emitPartial = () => {
    if (!onPartial || !contentBuffer) return;
    try {
      const partial = IncompleteJsonParser.parse(contentBuffer);
      if (partial && typeof partial === 'object' && isValidPartialResponse(partial)) {
        onPartial(partial);
      }
    } catch {
      // Ignore incomplete JSON parse failures during streaming
    }
  };

  const handleNamedEvent = (eventName: string, data: string) => {
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }
    if (typeof payload !== 'object' || payload === null) return;

    if (eventName === 'provisional') {
      const segments = (payload as { segments?: unknown }).segments;
      if (Array.isArray(segments) && segments.every(isValidProvisionalSegment)) {
        onProvisional?.(segments);
      }
    } else if (eventName === 'grammar') {
      const points = (payload as { grammarPoints?: unknown }).grammarPoints;
      if (Array.isArray(points)) {
        grammarPoints = points.filter(isValidGrammarPoint);
        onGrammar?.(grammarPoints);
      }
    } else if (eventName === 'error') {
      const message = (payload as { message?: unknown }).message;
      throw new Error(typeof message === 'string' ? message : 'Parse failed');
    }
  };

  const processLine = (rawLine: string) => {
    const line = rawLine.replace(/\r$/, '').trim();
    if (!line) {
      pendingEventName = null;
      return;
    }

    if (line.startsWith('event:')) {
      pendingEventName = line.slice(6).trim();
      return;
    }

    if (!line.startsWith('data:')) return;
    const data = line.slice(5).trimStart();
    if (!data || data === '[DONE]') {
      pendingEventName = null;
      return;
    }

    if (pendingEventName) {
      const eventName = pendingEventName;
      pendingEventName = null;
      handleNamedEvent(eventName, data);
      return;
    }

    const delta = extractDeltaContent(data);
    if (delta) {
      contentBuffer += delta;
      emitPartial();
    }
  };

  try {
    while (true) {
      throwIfAborted(signal);

      const { done, value } = await reader.read();
      throwIfAborted(signal);

      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const lineEnd = buffer.indexOf('\n');
        if (lineEnd === -1) break;

        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 1);
        processLine(line);
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw createAbortError();
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (buffer.trim()) {
    processLine(buffer);
  }

  if (!contentBuffer) {
    throw new Error('Empty response from parse');
  }

  let rawResult: unknown;
  try {
    rawResult = JSON.parse(contentBuffer);
  } catch {
    throw new Error('Invalid response from parse');
  }

  const validated = validateParseResponse(rawResult);
  if (!validated) {
    console.error('Parse v2 response validation failed:', rawResult);
    throw new Error('Invalid response format from parse');
  }

  return { ...validated, grammarPoints };
}
