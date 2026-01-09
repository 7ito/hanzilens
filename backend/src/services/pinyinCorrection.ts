/**
 * Pinyin correction service using pinyin-pro with CC-CEDICT reconciliation
 * 
 * Provides context-aware pinyin correction for Chinese text.
 * Uses pinyin-pro for polyphonic character disambiguation (多音字),
 * then reconciles tones with CC-CEDICT for accurate neutral tone (tone 5) handling.
 * 
 * Strategy:
 * 1. Use pinyin-pro for context-aware reading selection (handles polyphonic chars)
 * 2. Look up tokens/characters in CC-CEDICT for authoritative tone information
 * 3. Match pinyin-pro's base syllable with CC-CEDICT's tone
 * 4. Fall back gracefully when entries are not in dictionary
 */

import { pinyin } from 'pinyin-pro';
import { getCharacterReadings, getTokenPinyin } from './dictionary.js';

/**
 * Result type from pinyin-pro's pinyin function with type: 'all'
 */
interface PinyinDetailResult {
  origin: string;
  pinyin: string;
  num: number; // tone number (1-4, 0 for neutral)
  isZh: boolean;
}

/**
 * Check if a string contains Chinese characters
 */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * Check if a character is a Chinese character
 */
function isChineseChar(char: string): boolean {
  return /[\u4e00-\u9fff]/.test(char);
}

/**
 * Convert pinyin-pro's tone mark format to tone number format
 * e.g., "nǐ" -> "ni3", "hǎo" -> "hao3"
 * 
 * @param syllable - Pinyin syllable with tone mark
 * @param toneNum - Tone number (0-4, where 0 is neutral)
 * @returns Pinyin with tone number suffix
 */
function toneMarkToNumber(syllable: string, toneNum: number): string {
  // Mapping of accented vowels to base vowel
  const toneMap: Record<string, string> = {
    // Tone 1 (macron)
    'ā': 'a', 'ē': 'e', 'ī': 'i', 'ō': 'o', 'ū': 'u', 'ǖ': 'v',
    // Tone 2 (acute)
    'á': 'a', 'é': 'e', 'í': 'i', 'ó': 'o', 'ú': 'u', 'ǘ': 'v',
    // Tone 3 (caron)
    'ǎ': 'a', 'ě': 'e', 'ǐ': 'i', 'ǒ': 'o', 'ǔ': 'u', 'ǚ': 'v',
    // Tone 4 (grave)
    'à': 'a', 'è': 'e', 'ì': 'i', 'ò': 'o', 'ù': 'u', 'ǜ': 'v',
  };

  let result = '';
  for (const char of syllable) {
    const baseChar = toneMap[char];
    if (baseChar) {
      result += baseChar;
    } else {
      // Handle ü without tone mark
      result += char === 'ü' ? 'v' : char;
    }
  }

  // Append tone number (use 5 for neutral/0)
  const tone = toneNum === 0 ? 5 : toneNum;
  return result + tone;
}

/**
 * Extract base syllable (without tone number) from pinyin
 * e.g., "you3" -> "you", "peng2" -> "peng"
 */
function getBaseSyllable(pinyinSyllable: string): string {
  return pinyinSyllable.replace(/[1-5]$/, '').toLowerCase();
}

/**
 * Normalize pinyin for comparison
 * Handles variations like u:/v for ü
 */
function normalizePinyinBase(base: string): string {
  return base
    .toLowerCase()
    .replace(/u:/g, 'v')
    .replace(/ü/g, 'v');
}

/**
 * Reconcile pinyin-pro's syllable with CC-CEDICT tones.
 * 
 * Finds a CC-CEDICT reading that matches pinyin-pro's base syllable,
 * then uses CC-CEDICT's tone (which correctly handles neutral tones).
 * 
 * @param pinyinProSyllable - Syllable from pinyin-pro (e.g., "you3")
 * @param cedictReadings - All valid readings from CC-CEDICT (e.g., ["you3", "you5"])
 * @returns Best matching reading from CC-CEDICT, or original if no match
 */
function reconcileTone(pinyinProSyllable: string, cedictReadings: string[]): string {
  if (cedictReadings.length === 0) {
    return pinyinProSyllable;
  }

  const pinyinProBase = normalizePinyinBase(getBaseSyllable(pinyinProSyllable));
  
  // Find CC-CEDICT reading with matching base syllable
  for (const reading of cedictReadings) {
    const readingBase = normalizePinyinBase(getBaseSyllable(reading));
    if (readingBase === pinyinProBase) {
      return reading; // Use CC-CEDICT's tone
    }
  }
  
  // No match found - keep pinyin-pro's version
  return pinyinProSyllable;
}

/**
 * Recursively get pinyin for a token by segmenting it into dictionary-matchable parts.
 * Uses greedy longest-match-first strategy.
 * 
 * @param token - Chinese token to get pinyin for
 * @param pinyinProResults - Map of character index (within token) -> pinyin-pro result
 * @returns Array of pinyin syllables
 */
function getRecursiveTokenPinyin(
  token: string,
  pinyinProResults: Map<number, string>
): string[] {
  if (token.length === 0) {
    return [];
  }

  // Try to find the longest prefix that exists in CC-CEDICT
  for (let len = token.length; len >= 1; len--) {
    const prefix = token.slice(0, len);
    const cedictPinyin = getTokenPinyin(prefix);
    
    if (cedictPinyin) {
      // Found in CC-CEDICT - use its pinyin directly
      const syllables = cedictPinyin.split(' ');
      
      // Recursively process the remainder
      const remainder = token.slice(len);
      
      // Shift the pinyin-pro results for the remainder
      const shiftedResults = new Map<number, string>();
      for (const [idx, py] of pinyinProResults) {
        if (idx >= len) {
          shiftedResults.set(idx - len, py);
        }
      }
      
      const remainderPinyin = getRecursiveTokenPinyin(remainder, shiftedResults);
      return [...syllables, ...remainderPinyin];
    }
  }

  // No dictionary match for any prefix - fall back to character-by-character
  // with pinyin-pro + CC-CEDICT tone reconciliation
  const firstChar = token[0];
  const pinyinProSyllable = pinyinProResults.get(0);
  
  let finalSyllable: string;
  if (pinyinProSyllable && isChineseChar(firstChar)) {
    // Reconcile pinyin-pro with CC-CEDICT tone for single character
    const charReadings = getCharacterReadings(firstChar);
    finalSyllable = reconcileTone(pinyinProSyllable, charReadings);
  } else if (pinyinProSyllable) {
    finalSyllable = pinyinProSyllable;
  } else {
    // No pinyin-pro result - shouldn't happen for Chinese chars
    return getRecursiveTokenPinyin(token.slice(1), shiftMapIndices(pinyinProResults, 1));
  }

  // Process remainder
  const remainder = token.slice(1);
  const shiftedResults = shiftMapIndices(pinyinProResults, 1);
  const remainderPinyin = getRecursiveTokenPinyin(remainder, shiftedResults);
  
  return [finalSyllable, ...remainderPinyin];
}

/**
 * Shift all map indices by a given offset
 */
function shiftMapIndices(map: Map<number, string>, offset: number): Map<number, string> {
  const shifted = new Map<number, string>();
  for (const [idx, val] of map) {
    if (idx >= offset) {
      shifted.set(idx - offset, val);
    }
  }
  return shifted;
}

/**
 * Get context-aware pinyin for a Chinese token with CC-CEDICT reconciliation.
 * 
 * Uses pinyin-pro for polyphonic disambiguation, then reconciles with CC-CEDICT
 * for accurate tone information (especially neutral tones).
 * 
 * @param token - The Chinese text to get pinyin for
 * @returns Pinyin with tone numbers, space-separated by syllable (e.g., "ni3 hao3")
 */
export function getCorrectPinyin(token: string): string {
  // Skip non-Chinese tokens
  if (!token || !containsChinese(token)) {
    return '';
  }

  // First, try direct CC-CEDICT lookup for the whole token
  const directPinyin = getTokenPinyin(token);
  if (directPinyin) {
    return directPinyin;
  }

  // Get pinyin-pro results for context-aware disambiguation
  const details = pinyin(token, {
    type: 'all',
  }) as PinyinDetailResult[];

  // Build a map of character index -> pinyin-pro syllable
  const pinyinProResults = new Map<number, string>();
  let charIdx = 0;
  for (const detail of details) {
    if (detail.isZh) {
      pinyinProResults.set(charIdx, toneMarkToNumber(detail.pinyin, detail.num));
    }
    charIdx += detail.origin.length;
  }

  // Use recursive segmentation with CC-CEDICT reconciliation
  const syllables = getRecursiveTokenPinyin(token, pinyinProResults);
  return syllables.join(' ');
}

/**
 * Batch correct pinyin for multiple segments
 * 
 * @param segments - Array of segments with token and pinyin
 * @returns Array of corrected pinyin values (same order as input)
 */
export function correctSegmentsPinyin(
  segments: Array<{ token: string; pinyin: string }>
): string[] {
  return segments.map(seg => {
    const corrected = getCorrectPinyin(seg.token);
    // If correction returns empty but original had pinyin, keep original
    // (handles edge cases where pinyin-pro might not recognize something)
    return corrected || seg.pinyin;
  });
}

/**
 * A map that stores pinyin for each character position in the original sentence.
 * This allows looking up the context-aware pinyin for any substring.
 */
export interface PinyinMap {
  // Map of character index -> pinyin with tone number
  charPinyin: Map<number, string>;
  // Original sentence
  sentence: string;
}

/**
 * Build a pinyin map for an entire sentence.
 * 
 * This runs pinyin-pro on the full sentence to get context-aware pinyin
 * for polyphonic characters, then reconciles with CC-CEDICT for accurate
 * tone information (especially neutral tones like tone 5).
 * 
 * @param sentence - The full Chinese sentence
 * @returns PinyinMap for looking up pinyin by position
 */
export function buildPinyinMap(sentence: string): PinyinMap {
  const charPinyin = new Map<number, string>();
  
  if (!sentence) {
    return { charPinyin, sentence: '' };
  }
  
  // Get pinyin-pro results for entire sentence (context-aware)
  const details = pinyin(sentence, {
    type: 'all',
  }) as PinyinDetailResult[];
  
  // Build position map with CC-CEDICT reconciliation
  let charIndex = 0;
  for (const detail of details) {
    if (detail.isZh) {
      const pinyinProSyllable = toneMarkToNumber(detail.pinyin, detail.num);
      
      // Get CC-CEDICT readings for this character
      const cedictReadings = getCharacterReadings(detail.origin);
      
      // Reconcile tone with CC-CEDICT
      const finalPinyin = reconcileTone(pinyinProSyllable, cedictReadings);
      charPinyin.set(charIndex, finalPinyin);
    }
    // Move to next character position
    charIndex += detail.origin.length;
  }
  
  return { charPinyin, sentence };
}

/**
 * Get pinyin for a token at a specific position in the sentence.
 * 
 * First tries CC-CEDICT lookup for the whole token (to get compound-word
 * pinyin with correct neutral tones), then falls back to character-by-character
 * lookup from the pre-computed PinyinMap.
 * 
 * @param pinyinMap - Pre-computed pinyin map from buildPinyinMap
 * @param token - The token to get pinyin for
 * @param startIndex - Starting position of token in original sentence
 * @returns Pinyin with tone numbers, space-separated
 */
export function getPinyinFromMap(
  pinyinMap: PinyinMap, 
  token: string, 
  startIndex: number
): string {
  if (!token || !containsChinese(token)) {
    return '';
  }
  
  // First, try direct CC-CEDICT lookup for the whole token
  // This handles compound words with neutral tones (e.g., 朋友 -> peng2 you5)
  const directPinyin = getTokenPinyin(token);
  if (directPinyin) {
    return directPinyin;
  }
  
  // Try recursive segmentation to find compound words within the token
  // This handles cases like "不知道" which might not be in dictionary but "知道" is
  const syllables = getRecursiveTokenPinyinFromMap(token, pinyinMap, startIndex);
  return syllables.join(' ');
}

/**
 * Recursively get pinyin for a token using the pre-computed PinyinMap.
 * Uses greedy longest-match-first strategy with CC-CEDICT lookup.
 * 
 * @param token - Token to get pinyin for
 * @param pinyinMap - Pre-computed pinyin map
 * @param startIndex - Starting position in original sentence
 * @returns Array of pinyin syllables
 */
function getRecursiveTokenPinyinFromMap(
  token: string,
  pinyinMap: PinyinMap,
  startIndex: number
): string[] {
  if (token.length === 0) {
    return [];
  }

  // Try to find the longest prefix in CC-CEDICT
  for (let len = token.length; len >= 2; len--) {
    const prefix = token.slice(0, len);
    const cedictPinyin = getTokenPinyin(prefix);
    
    if (cedictPinyin) {
      const syllables = cedictPinyin.split(' ');
      const remainder = token.slice(len);
      const remainderPinyin = getRecursiveTokenPinyinFromMap(
        remainder, 
        pinyinMap, 
        startIndex + len
      );
      return [...syllables, ...remainderPinyin];
    }
  }

  // No multi-char match - use character from PinyinMap (already reconciled)
  const firstChar = token[0];
  const pinyinParts: string[] = [];
  
  if (isChineseChar(firstChar)) {
    const charPinyin = pinyinMap.charPinyin.get(startIndex);
    if (charPinyin) {
      pinyinParts.push(charPinyin);
    } else {
      // Fallback: get pinyin for just this character
      const fallback = getCorrectPinyin(firstChar);
      if (fallback) pinyinParts.push(fallback);
    }
  }

  // Process remainder
  const remainder = token.slice(1);
  const remainderPinyin = getRecursiveTokenPinyinFromMap(
    remainder,
    pinyinMap,
    startIndex + 1
  );
  
  return [...pinyinParts, ...remainderPinyin];
}

/**
 * Find the starting position of a token in a sentence.
 * 
 * Searches for the token starting from a given position hint.
 * Handles cases where the same token appears multiple times.
 * 
 * @param sentence - The full sentence
 * @param token - The token to find
 * @param searchFrom - Position to start searching from
 * @returns Starting index of token, or -1 if not found
 */
export function findTokenPosition(
  sentence: string, 
  token: string, 
  searchFrom: number = 0
): number {
  return sentence.indexOf(token, searchFrom);
}
