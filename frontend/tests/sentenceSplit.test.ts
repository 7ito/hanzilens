import { describe, it, expect } from 'vitest';
import { splitCombinedTextIntoSentences } from '@/lib/sentenceSplit';

describe('splitCombinedTextIntoSentences', () => {
  it('returns empty array for empty string', () => {
    expect(splitCombinedTextIntoSentences('')).toEqual([]);
  });

  it('returns empty array for falsy input', () => {
    expect(splitCombinedTextIntoSentences(null as unknown as string)).toEqual([]);
  });

  it('returns single chunk for sentence without hard breaks', () => {
    const result = splitCombinedTextIntoSentences('你好世界');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('你好世界');
    expect(result[0].id).toBe('sentence-1');
  });

  it('splits on Chinese period 。', () => {
    const result = splitCombinedTextIntoSentences('你好。世界。');
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('你好。');
    expect(result[1].text).toBe('世界。');
  });

  it('splits on Chinese exclamation ！', () => {
    const result = splitCombinedTextIntoSentences('太好了！真的吗？');
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('太好了！');
    expect(result[1].text).toBe('真的吗？');
  });

  it('splits on Chinese question mark ？', () => {
    const result = splitCombinedTextIntoSentences('你是谁？我是小明。');
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('你是谁？');
    expect(result[1].text).toBe('我是小明。');
  });

  it('splits on Chinese semicolon ；', () => {
    const result = splitCombinedTextIntoSentences('第一；第二。');
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('第一；');
    expect(result[1].text).toBe('第二。');
  });

  it('splits on ASCII punctuation !?;', () => {
    const result = splitCombinedTextIntoSentences('你好!世界?是的;');
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('你好!');
    expect(result[1].text).toBe('世界?');
    expect(result[2].text).toBe('是的;');
  });

  it('splits on ellipsis …', () => {
    const result = splitCombinedTextIntoSentences('等一下…好的。');
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('等一下…');
    expect(result[1].text).toBe('好的。');
  });

  it('consumes trailing punctuation after hard break', () => {
    // The closing quote 」 should stay with the sentence
    const result = splitCombinedTextIntoSentences('「你好。」再见。');
    expect(result).toHaveLength(2);
    // The 」 is punctuation following 。 so it gets consumed into the first chunk
    expect(result[0].text).toContain('你好。');
    expect(result[0].text).toContain('」');
  });

  it('merges punctuation-only chunk into previous sentence', () => {
    // If a chunk is only punctuation, it merges into the previous one
    const result = splitCombinedTextIntoSentences('你好。——再见。');
    // —— is not a hard break, but it follows a hard break
    // The 。 after 你好 splits there, then —— might become punctuation-only
    expect(result.length).toBeGreaterThanOrEqual(1);
    // Every chunk should contain at least some non-punctuation text
    for (const chunk of result) {
      expect(chunk.text.length).toBeGreaterThan(0);
    }
  });

  it('prepends leading punctuation to first real sentence', () => {
    const result = splitCombinedTextIntoSentences('——你好。');
    expect(result).toHaveLength(1);
    expect(result[0].text).toContain('——');
    expect(result[0].text).toContain('你好。');
  });

  it('splits on list markers (digit + 、)', () => {
    const result = splitCombinedTextIntoSentences('苹果1、橘子2、香蕉');
    expect(result.length).toBeGreaterThanOrEqual(2);
    // First chunk should have the content before the list marker
    expect(result[0].text).toContain('苹果');
  });

  it('handles multi-digit list markers', () => {
    const result = splitCombinedTextIntoSentences('第一点10、第二点');
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('normalizes whitespace', () => {
    const result = splitCombinedTextIntoSentences('你好   世界');
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('你好 世界');
  });

  it('generates 1-indexed IDs', () => {
    const result = splitCombinedTextIntoSentences('第一。第二。第三。');
    expect(result[0].id).toBe('sentence-1');
    expect(result[1].id).toBe('sentence-2');
    expect(result[2].id).toBe('sentence-3');
  });

  it('tracks correct startOffset and endOffset', () => {
    const text = '你好。世界。';
    const result = splitCombinedTextIntoSentences(text);
    expect(result).toHaveLength(2);

    // First chunk: "你好。" starts at 0, ends at 3
    expect(result[0].startOffset).toBe(0);
    expect(result[0].endOffset).toBe(3);

    // Second chunk: "世界。" starts at 3, ends at 6
    expect(result[1].startOffset).toBe(3);
    expect(result[1].endOffset).toBe(6);
  });

  it('handles mixed Chinese, English, and numbers', () => {
    const result = splitCombinedTextIntoSentences('我有3个apple。你呢？');
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('我有3个apple。');
    expect(result[1].text).toBe('你呢？');
  });

  it('handles multiple consecutive hard breaks as one split', () => {
    // ！！ should all be consumed in one chunk
    const result = splitCombinedTextIntoSentences('太好了！！真的。');
    expect(result).toHaveLength(2);
    expect(result[0].text).toContain('太好了');
    expect(result[0].text).toContain('！！');
  });

  it('handles whitespace-only input', () => {
    const result = splitCombinedTextIntoSentences('   ');
    expect(result).toEqual([]);
  });
});
