/**
 * Shared Chinese character detection utilities.
 */

/** Matches CJK Unified Ideographs (global flag). */
export const CHINESE_CHAR_REGEX_G = /[\u4e00-\u9fff]/g;

/** Matches a single CJK Unified Ideograph. */
export const CHINESE_CHAR_REGEX = /[\u4e00-\u9fff]/;

/** Returns true if the string contains at least one Chinese character. */
export function hasChinese(text: string): boolean {
  return CHINESE_CHAR_REGEX.test(text);
}

/** Returns true if the character is a Chinese character. */
export function isChineseChar(char: string): boolean {
  return CHINESE_CHAR_REGEX.test(char);
}
