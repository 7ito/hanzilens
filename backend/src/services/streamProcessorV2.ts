/**
 * Stream processor for the v2 parse pipeline.
 *
 * The v2 system prompt instructs the model to emit segments WITHOUT pinyin
 * ({"id": 0, "token": "你", "definition": "you"}) — pinyin was always
 * overwritten server-side anyway, so asking the model for it only slowed the
 * stream down. This processor injects the authoritative pinyin field right
 * after each "token" so the JSON reaching the client has the same segment
 * shape as v1: {"id": 0, "token": "你", "pinyin": "ni3", "definition": "you"}.
 *
 * If the model disobeys and emits a "pinyin" field anyway, its value is
 * replaced with the corrected pinyin so duplicate keys still agree.
 */

import {
  getPinyinFromMap,
  findTokenPosition,
  type PinyinMap,
} from './pinyinCorrection.js';

export interface StreamStateV2 {
  /** Accumulated content buffer for parsing */
  buffer: string;
  /** Are we currently inside the segments array? */
  inSegmentsArray: boolean;
  /** Position in original sentence for token lookup */
  sentencePosition: number;
  /** Corrected pinyin for the most recent token (used if the model emits a stray pinyin field) */
  lastCorrectedPinyin: string | null;
  /** Are we currently capturing a stray pinyin value to replace? */
  capturingPinyin: boolean;
}

export function createStreamStateV2(): StreamStateV2 {
  return {
    buffer: '',
    inSegmentsArray: false,
    sentencePosition: 0,
    lastCorrectedPinyin: null,
    capturingPinyin: false,
  };
}

/**
 * Process the accumulated buffer: inject pinyin after each token and emit
 * content that is safe to forward to the client.
 */
export function processStreamBufferV2(
  state: StreamStateV2,
  pinyinMap: PinyinMap
): { toEmit: string; state: StreamStateV2 } {
  let { buffer, inSegmentsArray, sentencePosition, lastCorrectedPinyin, capturingPinyin } = state;

  let toEmit = '';
  let i = 0;

  while (i < buffer.length) {
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

    if (inSegmentsArray) {
      // End of segments array (same heuristic as v1: tokens never contain ])
      if (buffer[i] === ']' && !capturingPinyin) {
        inSegmentsArray = false;
        lastCorrectedPinyin = null;
      }

      // Complete "token": "value" — emit it, then inject the pinyin field
      const tokenMatch = buffer.slice(i).match(/^"token"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      if (tokenMatch) {
        const token = JSON.parse(`"${tokenMatch[1]}"`) as string;

        let pinyin = '';
        const tokenPos = findTokenPosition(pinyinMap.sentence, token, sentencePosition);
        if (tokenPos >= 0) {
          pinyin = getPinyinFromMap(pinyinMap, token, tokenPos) || '';
          sentencePosition = tokenPos + token.length;
        }
        lastCorrectedPinyin = pinyin;

        toEmit += buffer.slice(0, i) + tokenMatch[0] + `,"pinyin":${JSON.stringify(pinyin)}`;
        buffer = buffer.slice(i + tokenMatch[0].length);
        i = 0;
        continue;
      }

      // Stray "pinyin": " from a disobedient model — replace its value
      const pinyinStartMatch = buffer.slice(i).match(/^"pinyin"\s*:\s*"/);
      if (pinyinStartMatch) {
        toEmit += buffer.slice(0, i) + pinyinStartMatch[0];
        buffer = buffer.slice(i + pinyinStartMatch[0].length);
        i = 0;
        capturingPinyin = true;
        continue;
      }

      if (capturingPinyin) {
        // Scan for the unescaped closing quote of the stray pinyin value
        let j = 0;
        while (j < buffer.length) {
          if (buffer[j] === '"' && (j === 0 || buffer[j - 1] !== '\\')) {
            const original = buffer.slice(0, j);
            // Corrected pinyin is plain ASCII, safe to emit raw inside the JSON string
            toEmit += (lastCorrectedPinyin ?? original) + '"';
            buffer = buffer.slice(j + 1);
            i = 0;
            capturingPinyin = false;
            break;
          }
          j++;
        }

        if (capturingPinyin) {
          // Closing quote not in buffer yet — hold everything
          return {
            toEmit,
            state: { buffer, inSegmentsArray, sentencePosition, lastCorrectedPinyin, capturingPinyin },
          };
        }
        continue;
      }
    }

    i++;
  }

  // Retain a tail so key patterns split across chunks aren't missed
  const keepLength = Math.min(50, buffer.length);
  const safeToEmit = buffer.slice(0, Math.max(0, buffer.length - keepLength));
  const remaining = buffer.slice(Math.max(0, buffer.length - keepLength));

  toEmit += safeToEmit;

  return {
    toEmit,
    state: {
      buffer: remaining,
      inSegmentsArray,
      sentencePosition,
      lastCorrectedPinyin,
      capturingPinyin,
    },
  };
}
