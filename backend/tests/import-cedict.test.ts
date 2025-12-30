import { describe, it, expect, beforeAll } from 'vitest';
import { parseLine, type ParsedEntry } from '../scripts/import-cedict.js';
import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = resolve(__dirname, '../data/cedict.sqlite');

describe('parseLine', () => {
  describe('standard entries', () => {
    it('parses a simple Chinese entry', () => {
      const result = parseLine('你好 你好 [ni3 hao3] /hello/hi/');
      expect(result).toEqual({
        traditional: '你好',
        simplified: '你好',
        pinyin: 'ni3 hao3',
        definitions: ['hello', 'hi'],
      });
    });

    it('parses entry with different traditional/simplified', () => {
      const result = parseLine('中國 中国 [Zhong1 guo2] /China/');
      expect(result).toEqual({
        traditional: '中國',
        simplified: '中国',
        pinyin: 'Zhong1 guo2',
        definitions: ['China'],
      });
    });

    it('parses single character entry', () => {
      const result = parseLine('我 我 [wo3] /I/me/my/');
      expect(result).toEqual({
        traditional: '我',
        simplified: '我',
        pinyin: 'wo3',
        definitions: ['I', 'me', 'my'],
      });
    });
  });

  describe('special entries', () => {
    it('parses percent sign entry', () => {
      const result = parseLine('% % [pa1] /percent (Tw)/');
      expect(result).toEqual({
        traditional: '%',
        simplified: '%',
        pinyin: 'pa1',
        definitions: ['percent (Tw)'],
      });
    });

    it('parses numeric entries', () => {
      const result = parseLine('110 110 [yao1 yao1 ling2] /the emergency number for law enforcement in Mainland China and Taiwan/');
      expect(result).toEqual({
        traditional: '110',
        simplified: '110',
        pinyin: 'yao1 yao1 ling2',
        definitions: ['the emergency number for law enforcement in Mainland China and Taiwan'],
      });
    });

    it('parses alphanumeric entries', () => {
      const result = parseLine('3C 3C [san1 C] /computers, communications, and consumer electronics/China Compulsory Certificate (CCC)/');
      expect(result).toEqual({
        traditional: '3C',
        simplified: '3C',
        pinyin: 'san1 C',
        definitions: ['computers, communications, and consumer electronics', 'China Compulsory Certificate (CCC)'],
      });
    });

    it('parses entries with brackets in definitions', () => {
      const result = parseLine('88 88 [ba1 ba1] /(Internet slang) bye-bye (alternative for 拜拜[bai2 bai2])/');
      expect(result).toEqual({
        traditional: '88',
        simplified: '88',
        pinyin: 'ba1 ba1',
        definitions: ['(Internet slang) bye-bye (alternative for 拜拜[bai2 bai2])'],
      });
    });

    it('parses entries with special pinyin like u:', () => {
      const result = parseLine('女 女 [nu:3] /female/woman/daughter/');
      expect(result).toEqual({
        traditional: '女',
        simplified: '女',
        pinyin: 'nu:3',
        definitions: ['female', 'woman', 'daughter'],
      });
    });

    it('parses entries with English letters in pinyin', () => {
      const result = parseLine('A A [A] /(slang) (Tw) to steal/');
      expect(result).toEqual({
        traditional: 'A',
        simplified: 'A',
        pinyin: 'A',
        definitions: ['(slang) (Tw) to steal'],
      });
    });
  });

  describe('non-entry lines', () => {
    it('returns null for comment lines', () => {
      expect(parseLine('# This is a comment')).toBeNull();
      expect(parseLine('#! version=1')).toBeNull();
    });

    it('returns null for empty lines', () => {
      expect(parseLine('')).toBeNull();
      expect(parseLine('   ')).toBeNull();
    });

    it('returns null for malformed lines', () => {
      expect(parseLine('not a valid entry')).toBeNull();
      expect(parseLine('missing [pinyin] /def/')).toBeNull();
    });
  });
});

describe('Database integration', () => {
  let db: Database.Database;

  beforeAll(() => {
    if (!existsSync(dbPath)) {
      console.log('Database not found - skipping integration tests');
      console.log('Run `npm run import-cedict` first to generate the database');
      return;
    }
    db = new Database(dbPath, { readonly: true });
  });

  it('database file exists', () => {
    expect(existsSync(dbPath)).toBe(true);
  });

  it('has expected number of entries (approximately 124,257)', () => {
    if (!db) return;
    
    const result = db.prepare('SELECT COUNT(*) as count FROM entries').get() as { count: number };
    // Allow some variance as the dictionary is updated periodically
    expect(result.count).toBeGreaterThan(120000);
    expect(result.count).toBeLessThan(130000);
  });

  it('can query 你好', () => {
    if (!db) return;
    
    const result = db.prepare('SELECT * FROM entries WHERE simplified = ?').get('你好') as {
      id: number;
      simplified: string;
      traditional: string;
      pinyin: string;
      definitions: string;
    };
    
    expect(result).toBeDefined();
    expect(result.simplified).toBe('你好');
    expect(result.traditional).toBe('你好');
    expect(result.pinyin).toBe('ni3 hao3');
    
    const definitions = JSON.parse(result.definitions);
    expect(definitions).toContain('hello; hi');
  });

  it('can query 中国 (simplified)', () => {
    if (!db) return;
    
    const result = db.prepare('SELECT * FROM entries WHERE simplified = ?').get('中国') as {
      id: number;
      simplified: string;
      traditional: string;
      pinyin: string;
      definitions: string;
    };
    
    expect(result).toBeDefined();
    expect(result.simplified).toBe('中国');
    expect(result.traditional).toBe('中國');
  });

  it('can query 中國 (traditional)', () => {
    if (!db) return;
    
    const result = db.prepare('SELECT * FROM entries WHERE traditional = ?').get('中國') as {
      id: number;
      simplified: string;
      traditional: string;
      pinyin: string;
      definitions: string;
    };
    
    expect(result).toBeDefined();
    expect(result.traditional).toBe('中國');
    expect(result.simplified).toBe('中国');
  });

  it('has indexes on simplified, traditional, and pinyin', () => {
    if (!db) return;
    
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type = 'index' AND tbl_name = 'entries'
    `).all() as { name: string }[];
    
    const indexNames = indexes.map(i => i.name);
    expect(indexNames).toContain('idx_simplified');
    expect(indexNames).toContain('idx_traditional');
    expect(indexNames).toContain('idx_pinyin');
  });

  it('can find entries with multiple pinyin readings', () => {
    if (!db) return;
    
    // 了 has multiple readings: le5 and liao3
    const results = db.prepare('SELECT * FROM entries WHERE simplified = ?').all('了') as {
      id: number;
      simplified: string;
      traditional: string;
      pinyin: string;
      definitions: string;
    }[];
    
    expect(results.length).toBeGreaterThan(1);
    const pinyinReadings = results.map(r => r.pinyin);
    expect(pinyinReadings).toContain('le5');
    expect(pinyinReadings).toContain('liao3');
  });
});
