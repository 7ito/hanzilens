/**
 * Lightweight runtime validators for AI parse responses.
 * 
 * These avoid adding Zod to the frontend bundle (~13KB) by using
 * hand-written type guards. Used in parseSse.ts to validate data
 * before it reaches components.
 */

import type { ParseResponse, ParsedSegment, TranslationPart } from '@/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidSegment(value: unknown): value is ParsedSegment {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'number' &&
    typeof value.token === 'string' &&
    typeof value.pinyin === 'string' &&
    typeof value.definition === 'string'
  );
}

function isValidTranslationPart(value: unknown): value is TranslationPart {
  if (!isRecord(value)) return false;
  return (
    typeof value.text === 'string' &&
    Array.isArray(value.segmentIds) &&
    value.segmentIds.every((id: unknown) => typeof id === 'number')
  );
}

/**
 * Validate a complete parse response (used for final streaming result).
 * Returns the typed response if valid, or null if malformed.
 */
export function validateParseResponse(data: unknown): ParseResponse | null {
  if (!isRecord(data)) return null;
  if (typeof data.translation !== 'string') return null;
  if (!Array.isArray(data.segments)) return null;
  if (!Array.isArray(data.translationParts)) return null;

  // Validate every segment
  if (!data.segments.every(isValidSegment)) return null;

  // Validate every translation part
  if (!data.translationParts.every(isValidTranslationPart)) return null;

  return data as ParseResponse;
}

/**
 * Check if a partial streaming result has a valid-enough shape to emit.
 * 
 * Partial results are intentionally loose since the JSON is incomplete
 * during streaming. We only check that existing fields have correct types
 * to prevent components from crashing on unexpected shapes.
 */
export function isValidPartialResponse(data: unknown): boolean {
  if (!isRecord(data)) return false;

  // If segments exists, validate it's an array of valid-looking segments
  if ('segments' in data) {
    if (!Array.isArray(data.segments)) return false;
    // Check each complete segment (incomplete ones at the end are fine)
    for (const seg of data.segments) {
      if (!isRecord(seg)) return false;
      // Only check fields that are present (partial JSON may have incomplete objects)
      if ('id' in seg && typeof seg.id !== 'number') return false;
      if ('token' in seg && typeof seg.token !== 'string') return false;
      if ('pinyin' in seg && typeof seg.pinyin !== 'string') return false;
      if ('definition' in seg && typeof seg.definition !== 'string') return false;
    }
  }

  // If translation exists, it should be a string
  if ('translation' in data && typeof data.translation !== 'string') return false;

  // If translationParts exists, validate array shape
  if ('translationParts' in data) {
    if (!Array.isArray(data.translationParts)) return false;
    for (const part of data.translationParts) {
      if (!isRecord(part)) return false;
      if ('text' in part && typeof part.text !== 'string') return false;
      if ('segmentIds' in part && !Array.isArray(part.segmentIds)) return false;
    }
  }

  return true;
}
