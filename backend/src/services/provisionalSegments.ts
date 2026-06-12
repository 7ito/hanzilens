/**
 * Stage 0 of the v2 parse pipeline: instant provisional segmentation.
 *
 * Before the LLM emits its first token (typically 500ms+), we can render a
 * full skeleton of the sentence from local data in ~1ms:
 *  - word boundaries via greedy longest-match against CC-CEDICT
 *  - pinyin from the context-aware pinyin map (pinyin-pro + CEDICT)
 *  - a first-gloss definition from CEDICT
 *
 * The frontend renders these immediately and replaces them as the LLM's
 * context-aware segments stream in.
 */

import { lookup, recursiveSegment } from './dictionary.js';
import { getPinyinFromMap, type PinyinMap } from './pinyinCorrection.js';
import { isChineseChar } from '../utils/chinese.js';
import type { ParsedSegment } from '../types/index.js';

/** Provisional segment: same shape as ParsedSegment plus its sentence offset */
export interface ProvisionalSegment extends ParsedSegment {
  /** Character offset of the token in the original sentence */
  startOffset: number;
}

const ALNUM_RUN_REGEX = /^[A-Za-z0-9][A-Za-z0-9.%-]*/;

/**
 * Pick a short gloss from the first CEDICT entry for a token.
 * CEDICT definitions can be long lists; the first sense is usually the most
 * common one and is good enough for a provisional display.
 */
function firstGloss(token: string): string {
  const entries = lookup(token);
  if (entries.length === 0) return '';

  for (const definition of entries[0].definitions) {
    const trimmed = definition.trim();
    // Skip pure cross-references like "variant of 嘗|尝[chang2]"
    if (trimmed && !/^(variant of|old variant of|see) /i.test(trimmed)) {
      return trimmed;
    }
  }
  return entries[0].definitions[0]?.trim() ?? '';
}

/**
 * Tokenize the non-Chinese stretches of a sentence the same way the LLM is
 * instructed to: alphanumeric runs stay together, punctuation is one token
 * per character, whitespace is skipped.
 */
function tokenizeNonChinese(run: string): Array<{ text: string; offset: number }> {
  const tokens: Array<{ text: string; offset: number }> = [];
  let i = 0;
  while (i < run.length) {
    const char = run[i];
    if (/\s/.test(char)) {
      i++;
      continue;
    }
    const alnumMatch = run.slice(i).match(ALNUM_RUN_REGEX);
    if (alnumMatch) {
      tokens.push({ text: alnumMatch[0], offset: i });
      i += alnumMatch[0].length;
      continue;
    }
    tokens.push({ text: char, offset: i });
    i++;
  }
  return tokens;
}

/**
 * Build provisional segments for a sentence using CEDICT greedy matching.
 *
 * @param sentence - The validated input sentence
 * @param pinyinMap - Pre-computed context-aware pinyin map for the sentence
 */
export function buildProvisionalSegments(
  sentence: string,
  pinyinMap: PinyinMap
): ProvisionalSegment[] {
  const segments: ProvisionalSegment[] = [];
  let id = 0;

  const push = (token: string, startOffset: number, isChinese: boolean) => {
    segments.push({
      id: id++,
      token,
      startOffset,
      pinyin: isChinese ? getPinyinFromMap(pinyinMap, token, startOffset) : '',
      definition: isChinese ? firstGloss(token) : '',
    });
  };

  let i = 0;
  while (i < sentence.length) {
    if (isChineseChar(sentence[i])) {
      // Collect a run of consecutive Chinese characters
      let end = i;
      while (end < sentence.length && isChineseChar(sentence[end])) {
        end++;
      }
      const run = sentence.slice(i, end);

      // Greedy longest-match word segmentation against CEDICT
      let offset = i;
      for (const word of recursiveSegment(run)) {
        push(word, offset, true);
        offset += word.length;
      }
      i = end;
    } else {
      // Collect the non-Chinese run and tokenize it
      let end = i;
      while (end < sentence.length && !isChineseChar(sentence[end])) {
        end++;
      }
      for (const { text, offset } of tokenizeNonChinese(sentence.slice(i, end))) {
        push(text, i + offset, false);
      }
      i = end;
    }
  }

  return segments;
}
