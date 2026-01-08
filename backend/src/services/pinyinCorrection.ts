/**
 * Pinyin correction service using pinyin-pro
 * 
 * Provides context-aware pinyin correction for Chinese text.
 * Uses pinyin-pro's intelligent disambiguation for polyphonic characters (多音字).
 */

import { pinyin } from 'pinyin-pro';

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
 * Get context-aware pinyin for a Chinese token
 * 
 * Uses pinyin-pro's intelligent disambiguation for polyphonic characters.
 * Returns empty string for non-Chinese tokens (punctuation, numbers, English).
 * 
 * @param token - The Chinese text to get pinyin for
 * @returns Pinyin with tone numbers, space-separated by syllable (e.g., "ni3 hao3")
 */
export function getCorrectPinyin(token: string): string {
  // Skip non-Chinese tokens
  if (!token || !containsChinese(token)) {
    return '';
  }

  // Get detailed pinyin info for each character
  // pinyin-pro handles context-aware disambiguation automatically
  const details = pinyin(token, {
    type: 'all',
  }) as PinyinDetailResult[];

  // Convert each syllable from tone marks to tone numbers
  const numberedPinyin = details.map(d => {
    if (!d.isZh) {
      // Keep non-Chinese characters as-is (shouldn't happen often)
      return d.origin;
    }
    return toneMarkToNumber(d.pinyin, d.num);
  });

  return numberedPinyin.join(' ');
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
 * (including tone sandhi for 不, 一, etc.), then stores the pinyin for
 * each character position.
 * 
 * @param sentence - The full Chinese sentence
 * @returns PinyinMap for looking up pinyin by position
 */
export function buildPinyinMap(sentence: string): PinyinMap {
  const charPinyin = new Map<number, string>();
  
  if (!sentence) {
    return { charPinyin, sentence: '' };
  }
  
  // Get pinyin for entire sentence with full context
  const details = pinyin(sentence, {
    type: 'all',
  }) as PinyinDetailResult[];
  
  // Build position map
  let charIndex = 0;
  for (const detail of details) {
    if (detail.isZh) {
      const pinyinWithTone = toneMarkToNumber(detail.pinyin, detail.num);
      charPinyin.set(charIndex, pinyinWithTone);
    }
    // Move to next character position
    // Note: detail.origin is the original character
    charIndex += detail.origin.length;
  }
  
  return { charPinyin, sentence };
}

/**
 * Get pinyin for a token at a specific position in the sentence.
 * 
 * Uses the pre-computed PinyinMap to look up context-aware pinyin.
 * Falls back to getCorrectPinyin if the position doesn't match.
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
  
  const pinyinParts: string[] = [];
  
  for (let i = 0; i < token.length; i++) {
    const char = token[i];
    const pos = startIndex + i;
    
    // Check if this is a Chinese character
    if (/[\u4e00-\u9fff]/.test(char)) {
      const charPinyin = pinyinMap.charPinyin.get(pos);
      if (charPinyin) {
        pinyinParts.push(charPinyin);
      } else {
        // Fallback: get pinyin for just this character
        const fallback = getCorrectPinyin(char);
        if (fallback) pinyinParts.push(fallback);
      }
    }
  }
  
  return pinyinParts.join(' ');
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
