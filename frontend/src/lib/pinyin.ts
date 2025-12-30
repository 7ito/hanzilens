/**
 * Pinyin utilities for converting numbered pinyin to accented pinyin
 * and providing tone-based colors
 */

// Tone colors (following standard convention)
// Tone 1: Red (high level)
// Tone 2: Orange (rising)
// Tone 3: Green (dipping)
// Tone 4: Blue (falling)
// Tone 5/neutral: Gray
const TONE_COLORS = {
  light: {
    1: '#dc2626', // red-600
    2: '#d97706', // amber-600
    3: '#16a34a', // green-600
    4: '#2563eb', // blue-600
    5: '#6b7280', // gray-500
  },
  dark: {
    1: '#f87171', // red-400
    2: '#fbbf24', // amber-400
    3: '#4ade80', // green-400
    4: '#60a5fa', // blue-400
    5: '#9ca3af', // gray-400
  },
} as const;

// Accented vowels mapping
const VOWEL_MAP: Record<string, Record<number, string>> = {
  a: { 1: '\u0101', 2: '\u00e1', 3: '\u01ce', 4: '\u00e0' },
  o: { 1: '\u014d', 2: '\u00f3', 3: '\u01d2', 4: '\u00f2' },
  e: { 1: '\u0113', 2: '\u00e9', 3: '\u011b', 4: '\u00e8' },
  i: { 1: '\u012b', 2: '\u00ed', 3: '\u01d0', 4: '\u00ec' },
  u: { 1: '\u016b', 2: '\u00fa', 3: '\u01d4', 4: '\u00f9' },
  '\u00fc': { 1: '\u01d6', 2: '\u01d8', 3: '\u01da', 4: '\u01dc' },
};

/**
 * Get the accented version of a vowel for a given tone
 */
function getAccentedVowel(vowel: string, tone: number): string {
  return VOWEL_MAP[vowel]?.[tone] || vowel;
}

/**
 * Convert a single pinyin syllable with tone number to accented pinyin
 * e.g., "ni3" -> "ni" with tone 3
 */
function convertSyllable(syllable: string): { text: string; tone: number } {
  if (!syllable) return { text: '', tone: 5 };

  // Extract tone number from end
  const match = syllable.match(/^(.*?)(\d)?$/);
  if (!match) return { text: syllable, tone: 5 };

  let letters = match[1];
  const tone = match[2] ? parseInt(match[2], 10) : 5;

  // Handle u: -> u with umlaut
  letters = letters.replace(/u:/g, '\u00fc');

  // Neutral tone - no accent needed
  if (tone === 5) return { text: letters, tone: 5 };

  // Find which vowel to accent (rules: a/e first, then last of i/u/u)
  const lettersArr = letters.split('');
  let accentIndex = -1;
  const priority = ['a', 'o', 'e'];

  // Check for a, o, e in priority order
  for (let i = 0; i < lettersArr.length; i++) {
    const c = lettersArr[i].toLowerCase();
    if (priority.includes(c)) {
      if (accentIndex === -1) {
        accentIndex = i;
      } else if (priority.indexOf(c) < priority.indexOf(lettersArr[accentIndex].toLowerCase())) {
        accentIndex = i;
      }
    }
  }

  // If no a/o/e found, find last i/u/u
  if (accentIndex === -1) {
    for (let i = lettersArr.length - 1; i >= 0; i--) {
      const c = lettersArr[i].toLowerCase();
      if (['i', 'u', '\u00fc'].includes(c)) {
        accentIndex = i;
        break;
      }
    }
  }

  // Apply accent
  if (accentIndex !== -1) {
    const original = lettersArr[accentIndex].toLowerCase();
    lettersArr[accentIndex] = getAccentedVowel(original, tone);
  }

  return { text: lettersArr.join(''), tone };
}

/**
 * Result of converting a pinyin string
 */
export interface ConvertedPinyin {
  syllables: Array<{ text: string; tone: number }>;
  fullText: string;
}

/**
 * Convert a space-separated pinyin string with tone numbers to accented pinyin
 * e.g., "ni3 hao3" -> { syllables: [{text: "ni", tone: 3}, {text: "hao", tone: 3}], fullText: "ni hao" }
 */
export function convertPinyin(pinyinStr: string): ConvertedPinyin {
  if (!pinyinStr) {
    return { syllables: [], fullText: '' };
  }

  const syllables = pinyinStr.split(' ').map(convertSyllable);
  const fullText = syllables.map((s) => s.text).join(' ');

  return { syllables, fullText };
}

/**
 * Get the color for a tone number
 */
export function getToneColor(tone: number, isDark = false): string {
  const validTone = tone >= 1 && tone <= 5 ? tone : 5;
  return isDark
    ? TONE_COLORS.dark[validTone as keyof typeof TONE_COLORS.dark]
    : TONE_COLORS.light[validTone as keyof typeof TONE_COLORS.light];
}

/**
 * Get tone colors for all syllables in a pinyin string
 */
export function getToneColors(pinyinStr: string, isDark = false): string[] {
  const { syllables } = convertPinyin(pinyinStr);
  return syllables.map((s) => getToneColor(s.tone, isDark));
}
