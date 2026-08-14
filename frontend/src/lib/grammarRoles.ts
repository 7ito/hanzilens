import type { ParsedSegment, TranslationPart } from '@/types';

/**
 * Helpers for instantiating grammar pattern roles with this sentence's words.
 *
 * Each role of an active grammar point is tinted with its own color (role 0,
 * role 1, …) so the parts of the construction are distinguishable — e.g. the
 * although-clause vs. the but-clause. Hues stay clear of the tone colors used
 * on characters/pinyin (red/amber/green/blue).
 */

const ROLE_TINTS = {
  light: ['rgba(124, 58, 237, 0.18)', 'rgba(13, 148, 136, 0.18)', 'rgba(219, 39, 119, 0.16)'],
  dark: ['rgba(167, 139, 250, 0.3)', 'rgba(45, 212, 191, 0.28)', 'rgba(244, 114, 182, 0.26)'],
} as const;

/** Solid variants for text/swatches keyed to the same hues as the tints */
const ROLE_COLORS = {
  light: ['#7c3aed', '#0d9488', '#db2777'],
  dark: ['#a78bfa', '#2dd4bf', '#f472b6'],
} as const;

export function getRoleTint(roleIndex: number, isDark: boolean): string {
  const palette = isDark ? ROLE_TINTS.dark : ROLE_TINTS.light;
  return palette[roleIndex % palette.length];
}

export function getRoleColor(roleIndex: number, isDark: boolean): string {
  const palette = isDark ? ROLE_COLORS.dark : ROLE_COLORS.light;
  return palette[roleIndex % palette.length];
}

/**
 * The Chinese text of a role's span: the tokens of its segments, in sentence
 * order (segment array order, not the order ids appear in the binding).
 */
export function chineseForSegments(segments: ParsedSegment[], segmentIds: number[]): string {
  const wanted = new Set(segmentIds);
  return segments
    .filter((seg) => wanted.has(seg.id))
    .map((seg) => seg.token)
    .join('');
}

/**
 * The English of a role's span, recovered from the translation alignment:
 * take the translationParts that reference any of the role's segments and
 * everything between the first and last of them (covering spaces and English
 * filler words like "the"/"of" that reference no segment).
 */
export function englishForSegments(parts: TranslationPart[], segmentIds: number[]): string {
  const wanted = new Set(segmentIds);
  let first = -1;
  let last = -1;

  parts.forEach((part, index) => {
    if (part.segmentIds.some((id) => wanted.has(id))) {
      if (first === -1) first = index;
      last = index;
    }
  });

  if (first === -1) return '';

  return parts
    .slice(first, last + 1)
    .map((part) => part.text)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
