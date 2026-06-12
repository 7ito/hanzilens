import { describe, it, expect } from 'vitest';
import {
  GRAMMAR_PATTERNS,
  getGrammarPattern,
  buildGrammarCatalogPromptSection,
  hydrateGrammarPoints,
} from '../src/data/grammarPatterns.js';

describe('grammar pattern catalog', () => {
  it('has unique pattern ids', () => {
    const ids = GRAMMAR_PATTERNS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every pattern has complete content', () => {
    for (const p of GRAMMAR_PATTERNS) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.template.length).toBeGreaterThan(0);
      expect(p.explanation.length).toBeGreaterThan(0);
      expect(p.level).toMatch(/^HSK[1-6]$/);
      expect(p.promptHint.length).toBeGreaterThan(0);
    }
  });

  it('builds a one-line-per-pattern prompt section', () => {
    const section = buildGrammarCatalogPromptSection();
    const lines = section.split('\n');
    expect(lines).toHaveLength(GRAMMAR_PATTERNS.length);
    expect(lines[0]).toBe(`- ${GRAMMAR_PATTERNS[0].id}: ${GRAMMAR_PATTERNS[0].promptHint}`);
  });

  it('looks up patterns by id', () => {
    expect(getGrammarPattern('ba-construction')?.name).toBe('把 construction');
    expect(getGrammarPattern('not-a-pattern')).toBeUndefined();
  });
});

describe('hydrateGrammarPoints', () => {
  it('hydrates valid points with catalog content', () => {
    const result = hydrateGrammarPoints([
      { patternId: 'bi-comparison', segmentIds: [1, 3] },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      patternId: 'bi-comparison',
      segmentIds: [1, 3],
      name: '比 comparison',
      level: 'HSK2',
    });
    expect(result[0].explanation.length).toBeGreaterThan(0);
    expect(result[0].template.length).toBeGreaterThan(0);
  });

  it('drops hallucinated pattern ids', () => {
    const result = hydrateGrammarPoints([
      { patternId: 'made-up-pattern', segmentIds: [0] },
      { patternId: 'shi-de', segmentIds: [1, 5] },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].patternId).toBe('shi-de');
  });

  it('drops malformed entries and invalid segment ids', () => {
    expect(hydrateGrammarPoints([
      null,
      'string',
      { segmentIds: [0] },
      { patternId: 'shi-de' },
      { patternId: 'shi-de', segmentIds: [] },
      { patternId: 'shi-de', segmentIds: ['a', -1, 1.5] },
    ])).toEqual([]);

    // Mixed valid/invalid ids: invalid ones filtered, valid kept
    const mixed = hydrateGrammarPoints([
      { patternId: 'shi-de', segmentIds: [-1, 2, 'x'] },
    ]);
    expect(mixed[0].segmentIds).toEqual([2]);
  });

  it('returns empty array for non-array input', () => {
    expect(hydrateGrammarPoints(undefined)).toEqual([]);
    expect(hydrateGrammarPoints(null)).toEqual([]);
    expect(hydrateGrammarPoints({})).toEqual([]);
  });
});
