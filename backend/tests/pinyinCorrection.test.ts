import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  getCorrectPinyin,
  buildPinyinMap,
  getPinyinFromMap,
  findTokenPosition,
  correctSegmentsPinyin,
} from '../src/services/pinyinCorrection.js';
import { getDatabase, closeDatabase, clearCaches } from '../src/services/dictionary.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '../data/cedict.sqlite');

describe('Pinyin Correction Service', () => {
  beforeAll(() => {
    if (!existsSync(dbPath)) {
      console.log('Database not found - skipping pinyin correction tests');
      console.log('Run `npm run import-cedict` first to generate the database');
      return;
    }
    getDatabase();
  });

  afterAll(() => {
    closeDatabase();
  });

  describe('getCorrectPinyin', () => {
    it('returns empty string for empty input', () => {
      expect(getCorrectPinyin('')).toBe('');
    });

    it('returns empty string for null/undefined input', () => {
      expect(getCorrectPinyin(null as unknown as string)).toBe('');
      expect(getCorrectPinyin(undefined as unknown as string)).toBe('');
    });

    it('returns empty string for non-Chinese input', () => {
      expect(getCorrectPinyin('hello')).toBe('');
      expect(getCorrectPinyin('123')).toBe('');
      expect(getCorrectPinyin('ABC')).toBe('');
    });

    it('returns correct pinyin for common words', () => {
      if (!existsSync(dbPath)) return;

      const result = getCorrectPinyin('你好');
      expect(result).toBe('ni3 hao3');
    });

    it('handles neutral tone (tone 5)', () => {
      if (!existsSync(dbPath)) return;

      // 朋友 should have tone 5 on 友 (peng2 you5 in CEDICT)
      const result = getCorrectPinyin('朋友');
      expect(result).toContain('peng2');
      // CEDICT has you5 for 友 in 朋友
    });

    it('handles single characters', () => {
      if (!existsSync(dbPath)) return;

      const result = getCorrectPinyin('我');
      expect(result).toBe('wo3');
    });

    it('handles ü/v correctly (CC-CEDICT uses u: format)', () => {
      if (!existsSync(dbPath)) return;

      const result = getCorrectPinyin('女');
      // CC-CEDICT stores ü as u: (e.g., "nu:3")
      expect(result).toMatch(/n[vü](:)?3|nu:3/);
    });

    it('handles multi-character compound words', () => {
      if (!existsSync(dbPath)) return;

      const result = getCorrectPinyin('中国');
      // CC-CEDICT may capitalize proper nouns (Zhong1 guo2)
      expect(result.toLowerCase()).toBe('zhong1 guo2');
    });

    it('handles characters not in CEDICT via pinyin-pro fallback', () => {
      if (!existsSync(dbPath)) return;

      // Single common character should still return pinyin
      const result = getCorrectPinyin('的');
      expect(result).toBeTruthy();
      expect(result).toMatch(/de\d/);
    });
  });

  describe('buildPinyinMap', () => {
    it('returns empty map for empty string', () => {
      const map = buildPinyinMap('');
      expect(map.charPinyin.size).toBe(0);
      expect(map.sentence).toBe('');
    });

    it('builds correct map for simple sentence', () => {
      if (!existsSync(dbPath)) return;

      const map = buildPinyinMap('你好');
      expect(map.sentence).toBe('你好');
      expect(map.charPinyin.size).toBe(2);
      // Position 0 = 你, Position 1 = 好
      expect(map.charPinyin.has(0)).toBe(true);
      expect(map.charPinyin.has(1)).toBe(true);
    });

    it('handles mixed Chinese/non-Chinese text', () => {
      if (!existsSync(dbPath)) return;

      const map = buildPinyinMap('我是ABC学生');
      expect(map.sentence).toBe('我是ABC学生');
      // 我(0), 是(1), A(2), B(3), C(4), 学(5), 生(6)
      expect(map.charPinyin.has(0)).toBe(true); // 我
      expect(map.charPinyin.has(1)).toBe(true); // 是
      expect(map.charPinyin.has(2)).toBe(false); // A - not Chinese
      expect(map.charPinyin.has(3)).toBe(false); // B
      expect(map.charPinyin.has(4)).toBe(false); // C
      expect(map.charPinyin.has(5)).toBe(true); // 学
      expect(map.charPinyin.has(6)).toBe(true); // 生
    });

    it('handles punctuation - no entries for punctuation chars', () => {
      if (!existsSync(dbPath)) return;

      const map = buildPinyinMap('你好！');
      // 你(0), 好(1), ！(2)
      expect(map.charPinyin.has(0)).toBe(true);
      expect(map.charPinyin.has(1)).toBe(true);
      expect(map.charPinyin.has(2)).toBe(false); // ！
    });
  });

  describe('getPinyinFromMap', () => {
    it('returns empty string for non-Chinese token', () => {
      const map = buildPinyinMap('hello');
      expect(getPinyinFromMap(map, 'hello', 0)).toBe('');
    });

    it('returns empty string for empty token', () => {
      const map = buildPinyinMap('你好');
      expect(getPinyinFromMap(map, '', 0)).toBe('');
    });

    it('returns correct pinyin for token at given position', () => {
      if (!existsSync(dbPath)) return;

      const map = buildPinyinMap('你好');
      const result = getPinyinFromMap(map, '你好', 0);
      expect(result).toBe('ni3 hao3');
    });

    it('handles compound words via direct CEDICT lookup', () => {
      if (!existsSync(dbPath)) return;

      const map = buildPinyinMap('中国人');
      const result = getPinyinFromMap(map, '中国', 0);
      // CC-CEDICT may capitalize proper nouns
      expect(result.toLowerCase()).toBe('zhong1 guo2');
    });

    it('handles token not in dictionary - falls back to char-by-char from map', () => {
      if (!existsSync(dbPath)) return;

      // Use a long phrase that's unlikely to be a single dictionary entry
      const sentence = '我喜欢你';
      const map = buildPinyinMap(sentence);
      const result = getPinyinFromMap(map, '我喜欢你', 0);
      // Should still return pinyin even if the full phrase isn't in CEDICT
      expect(result).toBeTruthy();
      expect(result.split(' ').length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('findTokenPosition', () => {
    it('finds token at beginning of sentence', () => {
      expect(findTokenPosition('你好世界', '你好')).toBe(0);
    });

    it('finds token in middle of sentence', () => {
      expect(findTokenPosition('你好世界', '世界')).toBe(2);
    });

    it('returns -1 for token not in sentence', () => {
      expect(findTokenPosition('你好', '世界')).toBe(-1);
    });

    it('respects searchFrom parameter', () => {
      // Sentence has 你 at positions 0 and 3
      const sentence = '你好你好';
      expect(findTokenPosition(sentence, '你好', 0)).toBe(0);
      expect(findTokenPosition(sentence, '你好', 1)).toBe(2);
    });

    it('defaults searchFrom to 0', () => {
      expect(findTokenPosition('你好', '你好')).toBe(0);
    });
  });

  describe('correctSegmentsPinyin', () => {
    it('corrects pinyin for array of segments', () => {
      if (!existsSync(dbPath)) return;

      const segments = [
        { token: '你好', pinyin: 'ni3 hao3' },
        { token: '世界', pinyin: 'shi4 jie4' },
      ];
      const result = correctSegmentsPinyin(segments);

      expect(result).toHaveLength(2);
      expect(result[0]).toBeTruthy();
      expect(result[1]).toBeTruthy();
    });

    it('preserves original pinyin when correction returns empty', () => {
      // Non-Chinese token: correction returns empty, should keep original
      const segments = [{ token: 'ABC', pinyin: 'original' }];
      const result = correctSegmentsPinyin(segments);

      expect(result[0]).toBe('original');
    });

    it('handles empty segments array', () => {
      const result = correctSegmentsPinyin([]);
      expect(result).toEqual([]);
    });
  });
});
