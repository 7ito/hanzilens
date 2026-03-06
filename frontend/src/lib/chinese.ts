/**
 * Shared Chinese character detection utilities.
 */

/** Matches a single CJK Unified Ideograph. */
export const CHINESE_CHAR_REGEX = /[\u4e00-\u9fff]/;

/** Returns true if the string contains at least one Chinese character. */
export function hasChinese(text: string): boolean {
  return CHINESE_CHAR_REGEX.test(text);
}
