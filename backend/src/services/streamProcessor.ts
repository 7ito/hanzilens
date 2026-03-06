/**
 * Stream processor for real-time pinyin correction in streaming JSON.
 *
 * Extracted from parse.ts for testability. Contains the state machine that
 * intercepts SSE-streamed JSON, captures "token" values, and replaces
 * corresponding "pinyin" values with corrected versions.
 */

import {
  getPinyinFromMap,
  findTokenPosition,
  type PinyinMap,
} from './pinyinCorrection.js';

/**
 * State machine for real-time pinyin correction in streaming JSON
 *
 * Tracks position in the JSON structure to:
 * 1. Detect when we're inside the "segments" array
 * 2. Capture the "token" value of each segment
 * 3. Replace the "pinyin" value with the corrected version
 */
export interface StreamState {
  /** Accumulated content buffer for parsing */
  buffer: string;
  /** Are we currently inside the segments array? */
  inSegmentsArray: boolean;
  /** Current segment's token (captured when we see "token": "xxx") */
  currentToken: string | null;
  /** Position in original sentence for token lookup */
  sentencePosition: number;
  /** Are we currently capturing a pinyin value to replace? */
  capturingPinyin: boolean;
  /** The pinyin value being captured (to be replaced) */
  capturedPinyin: string;
}

export function createStreamState(): StreamState {
  return {
    buffer: '',
    inSegmentsArray: false,
    currentToken: null,
    sentencePosition: 0,
    capturingPinyin: false,
    capturedPinyin: '',
  };
}

/**
 * Process the accumulated buffer and emit corrected content
 *
 * This function processes the JSON stream character by character, tracking state
 * to detect segment objects and replace pinyin values.
 *
 * Returns content that's safe to emit and updates the state.
 */
export function processStreamBuffer(
  state: StreamState,
  pinyinMap: PinyinMap
): { toEmit: string; state: StreamState } {
  let { buffer, inSegmentsArray, currentToken, sentencePosition, capturingPinyin, capturedPinyin } = state;

  let toEmit = '';
  let i = 0;

  while (i < buffer.length) {
    // Check for "segments" array start
    if (!inSegmentsArray) {
      const segmentsMatch = buffer.slice(i).match(/^"segments"\s*:\s*\[/);
      if (segmentsMatch) {
        toEmit += buffer.slice(0, i) + segmentsMatch[0];
        buffer = buffer.slice(i + segmentsMatch[0].length);
        i = 0;
        inSegmentsArray = true;
        continue;
      }
    }

    // Inside segments array - look for token and pinyin
    if (inSegmentsArray) {
      // Check for end of segments array
      if (buffer[i] === ']' && !capturingPinyin) {
        // Make sure this ] closes the segments array, not something nested
        // Simple heuristic: if we see ], assume it's the end
        inSegmentsArray = false;
        currentToken = null;
      }

      // Look for "token": "value" pattern
      const tokenMatch = buffer.slice(i).match(/^"token"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      if (tokenMatch) {
        currentToken = JSON.parse(`"${tokenMatch[1]}"`); // Unescape the string
        toEmit += buffer.slice(0, i) + tokenMatch[0];
        buffer = buffer.slice(i + tokenMatch[0].length);
        i = 0;
        continue;
      }

      // Look for "pinyin": " pattern (start of pinyin value)
      const pinyinStartMatch = buffer.slice(i).match(/^"pinyin"\s*:\s*"/);
      if (pinyinStartMatch && currentToken !== null) {
        // Found start of pinyin - emit everything up to and including the opening quote
        toEmit += buffer.slice(0, i) + pinyinStartMatch[0];
        buffer = buffer.slice(i + pinyinStartMatch[0].length);
        i = 0;
        capturingPinyin = true;
        capturedPinyin = '';
        continue;
      }

      // If capturing pinyin, look for the closing quote
      if (capturingPinyin) {
        // Find the end of the pinyin string value
        let j = 0;
        while (j < buffer.length) {
          if (buffer[j] === '"' && (j === 0 || buffer[j-1] !== '\\')) {
            // Found closing quote
            capturedPinyin = buffer.slice(0, j);

            // Get corrected pinyin
            let correctedPinyin = capturedPinyin;
            if (currentToken) {
              const tokenPos = findTokenPosition(pinyinMap.sentence, currentToken, sentencePosition);
              if (tokenPos >= 0) {
                const newPinyin = getPinyinFromMap(pinyinMap, currentToken, tokenPos);
                if (newPinyin) {
                  correctedPinyin = newPinyin;
                }
                sentencePosition = tokenPos + currentToken.length;
              }
            }

            // Emit the corrected pinyin and closing quote
            toEmit += correctedPinyin + '"';
            buffer = buffer.slice(j + 1);
            i = 0;
            capturingPinyin = false;
            capturedPinyin = '';
            currentToken = null; // Reset for next segment
            break;
          }
          j++;
        }

        if (capturingPinyin) {
          // Haven't found closing quote yet - keep buffering
          // Don't emit anything, keep the buffer as-is
          return {
            toEmit,
            state: { buffer, inSegmentsArray, currentToken, sentencePosition, capturingPinyin, capturedPinyin: buffer }
          };
        }
        continue;
      }
    }

    i++;
  }

  // Determine how much is safe to emit
  if (capturingPinyin) {
    // Still capturing pinyin - don't emit buffer yet
    return {
      toEmit,
      state: { buffer, inSegmentsArray, currentToken, sentencePosition, capturingPinyin, capturedPinyin }
    };
  }

  // Check if we might be at a partial match for a key pattern
  // Keep some buffer to avoid splitting patterns
  const keepLength = Math.min(50, buffer.length); // Keep last 50 chars for pattern matching
  const safeToEmit = buffer.slice(0, Math.max(0, buffer.length - keepLength));
  const remaining = buffer.slice(Math.max(0, buffer.length - keepLength));

  toEmit += safeToEmit;

  return {
    toEmit,
    state: {
      buffer: remaining,
      inSegmentsArray,
      currentToken,
      sentencePosition,
      capturingPinyin,
      capturedPinyin
    }
  };
}

/**
 * Extract JSON content from SSE data lines
 * Returns the delta content string or null if not a content chunk
 */
export function extractDeltaContent(sseData: string): string | null {
  if (!sseData.startsWith('data: ')) return null;

  const jsonStr = sseData.slice(6).trim();
  if (jsonStr === '[DONE]') return null;

  try {
    const parsed = JSON.parse(jsonStr);
    return parsed?.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}
