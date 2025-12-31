/**
 * Pinyin validation against CC-CEDICT
 * 
 * Validates that AI-generated pinyin matches valid readings from the dictionary.
 */

import { lookup } from '../../src/services/dictionary.js';
import type { PinyinValidationResult, PinyinMatchType } from './types.js';

/**
 * Normalize pinyin for comparison
 * 
 * Handles:
 * - Lowercase conversion
 * - Space normalization (remove extra spaces)
 * - ü encoding variations: lv -> lu:, nv -> nu:, lü -> lu:
 * - Missing tone numbers (treated as neutral tone 5)
 * - Common alternate spellings
 */
export function normalizePinyin(pinyin: string): string {
  if (!pinyin) return '';
  
  let normalized = pinyin
    .toLowerCase()
    .trim()
    // Normalize multiple spaces to single space
    .replace(/\s+/g, ' ');
  
  // Handle ü variations
  // Common patterns: lv, nv, lü, nü -> lu:, nu:
  // The CC-CEDICT format uses u: for ü
  
  // Convert lv/nv to lu:/nu: (common input method spelling)
  normalized = normalized.replace(/([ln])v(\d?)/g, '$1u:$2');
  
  // Convert lü/nü (actual ü character) to lu:/nu:
  normalized = normalized.replace(/([ln])ü(\d?)/g, '$1u:$2');
  
  // Convert standalone ü to u:
  normalized = normalized.replace(/ü/g, 'u:');
  
  // Add missing tone numbers - syllables without a tone number get neutral tone (5)
  // This handles cases like "le" -> "le5", "de" -> "de5", "ge" -> "ge5"
  // Split by space and process each syllable
  const syllables = normalized.split(' ');
  const normalizedSyllables = syllables.map(syllable => {
    // If syllable already ends with a number 1-5, leave it
    if (/[1-5]$/.test(syllable)) {
      return syllable;
    }
    // If syllable is non-empty and doesn't end with a number, add neutral tone
    if (syllable && /[a-z:]$/.test(syllable)) {
      return syllable + '5';
    }
    return syllable;
  });
  
  return normalizedSyllables.join(' ');
}

/**
 * Check if two pinyin strings match after normalization
 */
export function pinyinMatches(aiPinyin: string, dictPinyin: string): boolean {
  return normalizePinyin(aiPinyin) === normalizePinyin(dictPinyin);
}

/**
 * Check if pinyin is empty or should be empty
 * (for punctuation, numbers, English text)
 */
function shouldHaveEmptyPinyin(token: string): boolean {
  // Punctuation (Chinese and English)
  const punctuationRegex = /^[。，！？、；：""''（）【】《》\.\,\!\?\;\:\"\'\(\)\[\]\<\>\-\—\…]+$/;
  if (punctuationRegex.test(token)) return true;
  
  // Pure numbers
  const numberRegex = /^[\d\.\-\+]+$/;
  if (numberRegex.test(token)) return true;
  
  // Pure English/Latin text
  const englishRegex = /^[a-zA-Z\s]+$/;
  if (englishRegex.test(token)) return true;
  
  return false;
}

/**
 * Validate a single segment's pinyin against CC-CEDICT
 */
export function validateSegmentPinyin(token: string, aiPinyin: string): PinyinValidationResult {
  // Handle empty pinyin cases (punctuation, numbers, English)
  if (!aiPinyin || aiPinyin.trim() === '') {
    if (shouldHaveEmptyPinyin(token)) {
      return {
        token,
        aiPinyin,
        isValid: true,
        matchType: 'empty-pinyin',
        allValidReadings: [],
      };
    }
    // Token should have pinyin but AI gave empty - this is invalid
    // unless the token isn't in the dictionary
    const entries = lookup(token);
    if (entries.length === 0) {
      return {
        token,
        aiPinyin,
        isValid: true,
        matchType: 'not-found',
        allValidReadings: [],
      };
    }
    // Token is in dictionary but AI gave no pinyin - invalid
    return {
      token,
      aiPinyin,
      isValid: false,
      matchType: 'invalid',
      allValidReadings: entries.map(e => e.pinyin),
    };
  }
  
  // Check if token should have empty pinyin but AI gave one
  if (shouldHaveEmptyPinyin(token)) {
    // AI gave pinyin for punctuation/number - technically wrong but not critical
    // Mark as valid with empty-pinyin type
    return {
      token,
      aiPinyin,
      isValid: true,
      matchType: 'empty-pinyin',
      allValidReadings: [],
    };
  }
  
  // Look up token in CC-CEDICT
  const entries = lookup(token);
  
  // Token not in dictionary (proper nouns, new words, slang)
  if (entries.length === 0) {
    return {
      token,
      aiPinyin,
      isValid: true,  // Not penalized - we can't verify
      matchType: 'not-found',
      allValidReadings: [],
    };
  }
  
  // Get all valid pinyin readings
  const allValidReadings = entries.map(e => e.pinyin);
  
  // Check if AI pinyin matches any valid reading
  for (const reading of allValidReadings) {
    if (pinyinMatches(aiPinyin, reading)) {
      return {
        token,
        aiPinyin,
        isValid: true,
        matchType: 'exact',
        matchedReading: reading,
        allValidReadings,
      };
    }
  }
  
  // No match found - invalid pinyin
  return {
    token,
    aiPinyin,
    isValid: false,
    matchType: 'invalid',
    allValidReadings,
  };
}

/**
 * Validate pinyin for multiple segments
 */
export function validateSegmentsPinyin(
  segments: Array<{ token: string; pinyin: string }>
): PinyinValidationResult[] {
  return segments.map(seg => validateSegmentPinyin(seg.token, seg.pinyin));
}

/**
 * Calculate pinyin accuracy statistics
 */
export function calculatePinyinStats(validations: PinyinValidationResult[]): {
  valid: number;
  invalid: number;
  notInDictionary: number;
  emptyPinyin: number;
  accuracy: number;
} {
  let valid = 0;
  let invalid = 0;
  let notInDictionary = 0;
  let emptyPinyin = 0;
  
  for (const v of validations) {
    switch (v.matchType) {
      case 'exact':
        valid++;
        break;
      case 'invalid':
        invalid++;
        break;
      case 'not-found':
        notInDictionary++;
        break;
      case 'empty-pinyin':
        emptyPinyin++;
        break;
    }
  }
  
  // Accuracy only considers verifiable cases (valid + invalid)
  // Excludes not-found and empty-pinyin
  const verifiable = valid + invalid;
  const accuracy = verifiable > 0 ? valid / verifiable : 1;
  
  return {
    valid,
    invalid,
    notInDictionary,
    emptyPinyin,
    accuracy,
  };
}
