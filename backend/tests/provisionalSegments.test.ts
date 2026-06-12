import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDatabase, closeDatabase } from '../src/services/dictionary.js';
import { buildPinyinMap } from '../src/services/pinyinCorrection.js';
import { buildProvisionalSegments } from '../src/services/provisionalSegments.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '../data/cedict.sqlite');
const dbExists = existsSync(dbPath);

describe.skipIf(!dbExists)('buildProvisionalSegments', () => {
  beforeAll(() => {
    getDatabase();
  });

  afterAll(() => {
    closeDatabase();
  });

  function build(sentence: string) {
    return buildProvisionalSegments(sentence, buildPinyinMap(sentence));
  }

  it('segments a simple sentence into dictionary words with pinyin and gloss', () => {
    const segments = build('你好吗？');

    const tokens = segments.map((s) => s.token);
    expect(tokens.join('')).toBe('你好吗？');
    expect(tokens).toContain('你好');

    const nihao = segments.find((s) => s.token === '你好')!;
    expect(nihao.pinyin).toBe('ni3 hao3');
    expect(nihao.definition.length).toBeGreaterThan(0);

    const punct = segments.find((s) => s.token === '？')!;
    expect(punct.pinyin).toBe('');
    expect(punct.definition).toBe('');
  });

  it('assigns sequential ids and correct start offsets', () => {
    const segments = build('我喜欢中国菜。');

    // With no whitespace in the input, offsets accumulate token lengths exactly
    let expectedOffset = 0;
    segments.forEach((seg, idx) => {
      expect(seg.id).toBe(idx);
      expect(seg.startOffset).toBe(expectedOffset);
      expectedOffset += seg.token.length;
    });

    // Concatenation reconstructs the sentence
    expect(segments.map((s) => s.token).join('')).toBe('我喜欢中国菜。');
  });

  it('keeps alphanumeric runs as single tokens and skips whitespace', () => {
    const segments = build('这是第11集 NBA 比赛。');

    const tokens = segments.map((s) => s.token);
    expect(tokens).toContain('11');
    expect(tokens).toContain('NBA');
    expect(tokens.some((t) => /\s/.test(t))).toBe(false);
  });

  it('uses context-aware pinyin for polyphonic characters', () => {
    // 银行 (yin2 hang2) vs 行 (xing2) — the compound should win
    const segments = build('我去银行。');
    const bank = segments.find((s) => s.token === '银行')!;
    expect(bank.pinyin).toBe('yin2 hang2');
  });

  it('handles a sentence with no dictionary matches gracefully', () => {
    const segments = build('！！！');
    expect(segments).toHaveLength(3);
    segments.forEach((s) => {
      expect(s.pinyin).toBe('');
      expect(s.definition).toBe('');
    });
  });
});
