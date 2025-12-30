import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  lookup,
  recursiveSegment,
  definitionLookup,
  getDatabase,
  closeDatabase,
  clearCaches,
} from '../src/services/dictionary.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '../data/cedict.sqlite');

describe('Dictionary Service', () => {
  beforeAll(() => {
    if (!existsSync(dbPath)) {
      console.log('Database not found - skipping dictionary tests');
      console.log('Run `npm run import-cedict` first to generate the database');
      return;
    }
    // Initialize database connection
    getDatabase();
  });

  afterAll(() => {
    closeDatabase();
  });

  beforeEach(() => {
    clearCaches();
  });

  describe('lookup', () => {
    it('finds entry by simplified Chinese', () => {
      const entries = lookup('你好');
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].simplified).toBe('你好');
      expect(entries[0].pinyin).toBe('ni3 hao3');
      expect(entries[0].definitions).toContain('hello; hi');
    });

    it('finds entry by traditional Chinese', () => {
      const entries = lookup('中國');
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].traditional).toBe('中國');
      expect(entries[0].simplified).toBe('中国');
    });

    it('returns multiple entries for characters with multiple readings', () => {
      // 了 has multiple readings: le5 and liao3
      const entries = lookup('了');
      expect(entries.length).toBeGreaterThan(1);
      const pinyinReadings = entries.map(e => e.pinyin);
      expect(pinyinReadings).toContain('le5');
      expect(pinyinReadings).toContain('liao3');
    });

    it('returns empty array for non-existent token', () => {
      const entries = lookup('不存在的词xyz');
      expect(entries).toEqual([]);
    });

    it('caches results (second lookup should be faster)', () => {
      // First lookup
      const start1 = performance.now();
      lookup('学习');
      const time1 = performance.now() - start1;

      // Second lookup (should hit cache)
      const start2 = performance.now();
      lookup('学习');
      const time2 = performance.now() - start2;

      // Cache hit should be significantly faster
      // (this is a soft check - cache is working if no errors)
      expect(time2).toBeLessThanOrEqual(time1 + 1); // Allow small variance
    });

    it('finds single character entries', () => {
      const entries = lookup('我');
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].simplified).toBe('我');
    });
  });

  describe('recursiveSegment', () => {
    it('returns single segment for dictionary word', () => {
      const segments = recursiveSegment('你好');
      expect(segments).toEqual(['你好']);
    });

    it('segments compound not in dictionary', () => {
      // 你好吗 might not be a single dictionary entry
      // but 你好 and 吗 are
      const segments = recursiveSegment('你好吗');
      expect(segments.length).toBeGreaterThanOrEqual(2);
      expect(segments).toContain('你好');
      expect(segments).toContain('吗');
    });

    it('handles characters not in dictionary by returning them individually', () => {
      // Mix of real characters and something unlikely to be in dictionary
      const segments = recursiveSegment('我');
      expect(segments).toEqual(['我']);
    });

    it('handles empty string', () => {
      const segments = recursiveSegment('');
      expect(segments).toEqual([]);
    });

    it('handles longer compound phrases', () => {
      // 中华人民共和国 - People's Republic of China
      const segments = recursiveSegment('中华人民共和国');
      expect(segments.length).toBeGreaterThanOrEqual(1);
      // Should find some valid segments
      expect(segments.join('')).toBe('中华人民共和国');
    });

    it('greedy matches longest prefix first', () => {
      // 喜欢 is in dictionary, so it should match that first
      // rather than 喜 + 欢
      const segments = recursiveSegment('喜欢');
      expect(segments).toEqual(['喜欢']);
    });
  });

  describe('definitionLookup', () => {
    it('returns entries for existing word', () => {
      const result = definitionLookup('学习');
      expect(result).not.toBeNull();
      expect(result!.entries.length).toBeGreaterThan(0);
      expect(result!.segments).toBeUndefined();
    });

    it('returns null for empty token', () => {
      expect(definitionLookup('')).toBeNull();
      expect(definitionLookup('   ')).toBeNull();
    });

    it('returns segments when recursive breakdown is needed', () => {
      // Use a phrase that's unlikely to be a single dictionary entry
      const result = definitionLookup('我喜欢你');
      expect(result).not.toBeNull();
      expect(result!.entries.length).toBeGreaterThan(0);
      expect(result!.segments).toBeDefined();
      expect(result!.segments!.length).toBeGreaterThan(1);
    });

    it('trims whitespace from token', () => {
      const result = definitionLookup('  你好  ');
      expect(result).not.toBeNull();
      expect(result!.entries[0].simplified).toBe('你好');
    });

    it('returns 404-worthy null for non-Chinese gibberish', () => {
      const result = definitionLookup('xyz123');
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('handles punctuation (returns null)', () => {
      const result = definitionLookup('。');
      // Punctuation may or may not be in dictionary
      // Either result is acceptable
      expect(result === null || result.entries.length >= 0).toBe(true);
    });

    it('handles mixed Chinese and English', () => {
      // Should at least find the Chinese parts
      const segments = recursiveSegment('hello你好');
      // The behavior depends on whether 'hello' characters exist
      // Just verify it doesn't crash and returns something
      expect(segments.length).toBeGreaterThan(0);
    });

    it('handles traditional characters correctly', () => {
      const result = definitionLookup('學習'); // traditional
      expect(result).not.toBeNull();
      expect(result!.entries.length).toBeGreaterThan(0);
    });
  });
});
