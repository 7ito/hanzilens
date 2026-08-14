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

  it('every pattern has complete content and at least one role', () => {
    for (const p of GRAMMAR_PATTERNS) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/);
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.template.length).toBeGreaterThan(0);
      expect(p.explanation.length).toBeGreaterThan(0);
      expect(p.level).toMatch(/^HSK[1-6]$/);
      expect(p.promptHint.length).toBeGreaterThan(0);
      expect(p.roles.length).toBeGreaterThan(0);
      for (const role of p.roles) {
        expect(role.key).toMatch(/^[a-z]+$/);
        expect(role.label.length).toBeGreaterThan(0);
      }
    }
  });

  it('has unique role keys within each pattern', () => {
    for (const p of GRAMMAR_PATTERNS) {
      const keys = p.roles.map((r) => r.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('builds a one-line-per-pattern prompt section including role keys', () => {
    const section = buildGrammarCatalogPromptSection();
    const lines = section.split('\n');
    expect(lines).toHaveLength(GRAMMAR_PATTERNS.length);
    const first = GRAMMAR_PATTERNS[0];
    expect(lines[0]).toBe(
      `- ${first.id}: ${first.promptHint} (roles: ${first.roles.map((r) => r.key).join(', ')})`
    );
  });

  it('looks up patterns by id', () => {
    expect(getGrammarPattern('ba-construction')?.name).toBe('把 construction');
    expect(getGrammarPattern('not-a-pattern')).toBeUndefined();
  });
});

describe('hydrateGrammarPoints', () => {
  it('hydrates valid points with catalog content and bound roles', () => {
    const result = hydrateGrammarPoints([
      { patternId: 'suiran-danshi', roles: { concession: [1, 2, 3], contrast: [6, 7] } },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      patternId: 'suiran-danshi',
      name: '虽然…但是',
      level: 'HSK2',
    });
    expect(result[0].roles).toEqual([
      { key: 'concession', label: 'although…', segmentIds: [1, 2, 3] },
      { key: 'contrast', label: '…but', segmentIds: [6, 7] },
    ]);
    expect(result[0].explanation.length).toBeGreaterThan(0);
    expect(result[0].template.length).toBeGreaterThan(0);
  });

  it('keeps roles in catalog order regardless of model emission order', () => {
    const result = hydrateGrammarPoints([
      { patternId: 'yinwei-suoyi', roles: { effect: [5], cause: [1, 2] } },
    ]);

    expect(result[0].roles.map((r) => r.key)).toEqual(['cause', 'effect']);
  });

  it('omits unbound roles (e.g. agentless 被 passive)', () => {
    const result = hydrateGrammarPoints([
      { patternId: 'bei-passive', roles: { receiver: [0], action: [3, 4] } },
    ]);

    expect(result[0].roles.map((r) => r.key)).toEqual(['receiver', 'action']);
  });

  it('drops hallucinated pattern ids and unknown role keys', () => {
    const result = hydrateGrammarPoints([
      { patternId: 'made-up-pattern', roles: { thing: [0] } },
      { patternId: 'shi-de', roles: { emphasized: [2], invented: [1, 5] } },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].patternId).toBe('shi-de');
    expect(result[0].roles).toEqual([
      { key: 'emphasized', label: 'emphasized detail', segmentIds: [2] },
    ]);
  });

  it('drops malformed entries, empty bindings, and invalid segment ids', () => {
    expect(
      hydrateGrammarPoints([
        null,
        'string',
        { roles: { emphasized: [0] } },
        { patternId: 'shi-de' },
        { patternId: 'shi-de', roles: 'not-an-object' },
        { patternId: 'shi-de', roles: {} },
        { patternId: 'shi-de', roles: { emphasized: [] } },
        { patternId: 'shi-de', roles: { emphasized: ['a', -1, 1.5] } },
        // Legacy v1 shape (segmentIds without roles) must not crash, just drop
        { patternId: 'shi-de', segmentIds: [1, 5] },
      ])
    ).toEqual([]);

    // Mixed valid/invalid ids inside a role: invalid ones filtered, valid kept
    const mixed = hydrateGrammarPoints([
      { patternId: 'shi-de', roles: { emphasized: [-1, 2, 'x'] } },
    ]);
    expect(mixed[0].roles[0].segmentIds).toEqual([2]);
  });

  it('returns empty array for non-array input', () => {
    expect(hydrateGrammarPoints(undefined)).toEqual([]);
    expect(hydrateGrammarPoints(null)).toEqual([]);
    expect(hydrateGrammarPoints({})).toEqual([]);
  });
});
