import { describe, it, expect } from 'vitest';
import { chineseForSegments, englishForSegments } from '@/lib/grammarRoles';
import type { ParsedSegment, TranslationPart } from '@/types';

const segments: ParsedSegment[] = [
  { id: 0, token: '我', pinyin: 'wo3', definition: 'I' },
  { id: 1, token: '学', pinyin: 'xue2', definition: 'study' },
  { id: 2, token: '了', pinyin: 'le5', definition: '(completed)' },
  { id: 3, token: '三年', pinyin: 'san1 nian2', definition: 'three years' },
  { id: 4, token: '中文', pinyin: 'zhong1 wen2', definition: 'Chinese' },
];

describe('chineseForSegments', () => {
  it('joins tokens in sentence order regardless of id order in the binding', () => {
    expect(chineseForSegments(segments, [4, 1, 3])).toBe('学三年中文');
  });

  it('ignores ids that match no segment', () => {
    expect(chineseForSegments(segments, [99, 0])).toBe('我');
  });

  it('returns empty string for an empty binding', () => {
    expect(chineseForSegments(segments, [])).toBe('');
  });
});

describe('englishForSegments', () => {
  // "I studied Chinese for three years"
  const parts: TranslationPart[] = [
    { text: 'I', segmentIds: [0] },
    { text: ' ', segmentIds: [] },
    { text: 'studied', segmentIds: [1, 2] },
    { text: ' ', segmentIds: [] },
    { text: 'Chinese', segmentIds: [4] },
    { text: ' ', segmentIds: [] },
    { text: 'for', segmentIds: [] },
    { text: ' ', segmentIds: [] },
    { text: 'three years', segmentIds: [3] },
  ];

  it('recovers a contiguous phrase including connecting filler words', () => {
    // Role spans 中文 + 三年: includes the "for" between them
    expect(englishForSegments(parts, [4, 3])).toBe('Chinese for three years');
  });

  it('recovers a single-part phrase', () => {
    expect(englishForSegments(parts, [1])).toBe('studied');
  });

  it('returns empty string when no part references the segments', () => {
    expect(englishForSegments(parts, [99])).toBe('');
  });

  it('collapses whitespace across multi-part spans', () => {
    expect(englishForSegments(parts, [0, 1])).toBe('I studied');
  });
});
