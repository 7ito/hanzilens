import { describe, it, expect } from 'vitest';
import { convertPinyin, getToneColor, getToneColors } from '@/lib/pinyin';

describe('convertPinyin', () => {
  it('returns empty for empty string', () => {
    const result = convertPinyin('');
    expect(result).toEqual({ syllables: [], fullText: '' });
  });

  it('returns empty for falsy input', () => {
    const result = convertPinyin(null as unknown as string);
    expect(result).toEqual({ syllables: [], fullText: '' });
  });

  it('converts single syllable with tone 1 (macron)', () => {
    const result = convertPinyin('ma1');
    expect(result.syllables).toEqual([{ text: 'mā', tone: 1 }]);
    expect(result.fullText).toBe('mā');
  });

  it('converts single syllable with tone 2 (acute)', () => {
    const result = convertPinyin('ma2');
    expect(result.syllables).toEqual([{ text: 'má', tone: 2 }]);
  });

  it('converts single syllable with tone 3 (caron)', () => {
    const result = convertPinyin('ni3');
    expect(result.syllables).toEqual([{ text: 'nǐ', tone: 3 }]);
  });

  it('converts single syllable with tone 4 (grave)', () => {
    const result = convertPinyin('shi4');
    expect(result.syllables).toEqual([{ text: 'shì', tone: 4 }]);
  });

  it('handles tone 5 (neutral) - no accent', () => {
    const result = convertPinyin('ma5');
    expect(result.syllables).toEqual([{ text: 'ma', tone: 5 }]);
  });

  it('defaults to tone 5 when no tone number', () => {
    const result = convertPinyin('ma');
    expect(result.syllables).toEqual([{ text: 'ma', tone: 5 }]);
  });

  it('converts multi-syllable pinyin', () => {
    const result = convertPinyin('ni3 hao3');
    expect(result.syllables).toEqual([
      { text: 'nǐ', tone: 3 },
      { text: 'hǎo', tone: 3 },
    ]);
    expect(result.fullText).toBe('nǐ hǎo');
  });

  it('handles u: -> ü conversion', () => {
    const result = convertPinyin('lu:4');
    expect(result.syllables[0].text).toBe('lǜ');
    expect(result.syllables[0].tone).toBe(4);
  });

  it('handles u: with tone 5 (neutral ü)', () => {
    const result = convertPinyin('lu:5');
    expect(result.syllables[0].text).toBe('lü');
    expect(result.syllables[0].tone).toBe(5);
  });

  it('places accent on a over o/e (priority rule)', () => {
    // "hao3" - a has higher priority than o, accent goes on a
    const result = convertPinyin('hao3');
    expect(result.syllables[0].text).toBe('hǎo');
  });

  it('places accent on o over e (priority rule)', () => {
    // "gou3" - o has priority
    const result = convertPinyin('gou3');
    expect(result.syllables[0].text).toBe('gǒu');
  });

  it('places accent on e when no a/o', () => {
    const result = convertPinyin('mei2');
    expect(result.syllables[0].text).toBe('méi');
  });

  it('places accent on last of i/u/ü when no a/o/e', () => {
    // "dui4" - last of i/u is i
    const result = convertPinyin('dui4');
    expect(result.syllables[0].text).toBe('duì');
  });

  it('places accent on i in "liu" (last of i/u)', () => {
    const result = convertPinyin('liu2');
    expect(result.syllables[0].text).toBe('liú');
  });

  it('handles consonant-only input', () => {
    // Edge case: no vowels at all
    const result = convertPinyin('m2');
    // No vowel to accent, returns text as-is with tone
    expect(result.syllables[0].tone).toBe(2);
    expect(result.syllables[0].text).toBe('m');
  });

  it('handles empty syllable in multi-syllable input', () => {
    // Double space would produce empty syllable
    const result = convertPinyin('ni3  hao3');
    expect(result.syllables).toHaveLength(3);
    expect(result.syllables[1]).toEqual({ text: '', tone: 5 });
  });
});

describe('getToneColor', () => {
  it('returns correct light mode colors for each tone', () => {
    expect(getToneColor(1)).toBe('#dc2626'); // red
    expect(getToneColor(2)).toBe('#d97706'); // amber
    expect(getToneColor(3)).toBe('#16a34a'); // green
    expect(getToneColor(4)).toBe('#2563eb'); // blue
    expect(getToneColor(5)).toBe('#6b7280'); // gray
  });

  it('returns correct dark mode colors', () => {
    expect(getToneColor(1, true)).toBe('#f87171'); // red-400
    expect(getToneColor(2, true)).toBe('#fbbf24'); // amber-400
    expect(getToneColor(3, true)).toBe('#4ade80'); // green-400
    expect(getToneColor(4, true)).toBe('#60a5fa'); // blue-400
    expect(getToneColor(5, true)).toBe('#9ca3af'); // gray-400
  });

  it('falls back to tone 5 (gray) for out-of-range values', () => {
    expect(getToneColor(0)).toBe('#6b7280');
    expect(getToneColor(6)).toBe('#6b7280');
    expect(getToneColor(99)).toBe('#6b7280');
    expect(getToneColor(-1)).toBe('#6b7280');
  });
});

describe('getToneColors', () => {
  it('returns array of colors matching syllable count', () => {
    const colors = getToneColors('ni3 hao3');
    expect(colors).toHaveLength(2);
    expect(colors[0]).toBe('#16a34a'); // tone 3 = green
    expect(colors[1]).toBe('#16a34a'); // tone 3 = green
  });

  it('returns empty array for empty input', () => {
    expect(getToneColors('')).toEqual([]);
  });

  it('returns dark mode colors when isDark is true', () => {
    const colors = getToneColors('ma1', true);
    expect(colors[0]).toBe('#f87171'); // dark red for tone 1
  });
});
