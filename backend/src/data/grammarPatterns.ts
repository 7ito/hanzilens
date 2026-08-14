/**
 * Grammar pattern catalog for the v2 parse pipeline.
 *
 * Every pattern here PARTITIONS the sentence: it defines named roles (the
 * although-part and the but-part, the thing compared and what it's compared
 * against…) that the model binds to segment IDs. Single-marker patterns
 * (aspect 了/过/着, measure words, reduplication…) are deliberately absent —
 * the segment definitions already convey those, and annotating them only
 * highlights what the reader can already see.
 *
 * The LLM emits {patternId, roles: {roleKey: [segmentIds]}}; all displayed
 * content (name, template, explanation, level, role labels) is hydrated
 * server-side from this catalog, keeping model output small and the
 * explanation content deterministic and hand-editable.
 *
 * `promptHint` is the one-line recognition hint embedded in the system
 * prompt. Keep hints short: the catalog lives in the static system prompt and
 * benefits from provider prompt caching, but there is no reason to waste
 * tokens.
 */

export interface GrammarRole {
  /** Stable key the model binds segment IDs to */
  key: string;
  /** Learner-facing label shown next to the bound words, e.g. "although…" */
  label: string;
}

export interface GrammarPattern {
  /** Stable identifier emitted by the model */
  id: string;
  /** Display name */
  name: string;
  /** Structural template, e.g. "A 比 B + adj" */
  template: string;
  /** 1-2 sentence learner-facing explanation */
  explanation: string;
  /** Approximate HSK level where the pattern is introduced */
  level: string;
  /** One-line recognition hint for the system prompt */
  promptHint: string;
  /** Roles the model binds to segment spans, in display order */
  roles: GrammarRole[];
}

export const GRAMMAR_PATTERNS: GrammarPattern[] = [
  // ── Paired connectives: clause partitions ────────────────────────────────
  {
    id: 'suiran-danshi',
    name: '虽然…但是',
    template: '虽然 + A，但是/可是 + B',
    explanation: '"Although A, (but) B." Unlike English, Chinese uses both 虽然 and 但是 in the same sentence.',
    level: 'HSK2',
    promptHint: '虽然…但是 "although... but"',
    roles: [
      { key: 'concession', label: 'although…' },
      { key: 'contrast', label: '…but' },
    ],
  },
  {
    id: 'yinwei-suoyi',
    name: '因为…所以',
    template: '因为 + Cause，所以 + Effect',
    explanation: '"Because A, therefore B." Both halves commonly appear together; either may also stand alone.',
    level: 'HSK2',
    promptHint: '因为…所以 cause and effect pair',
    roles: [
      { key: 'cause', label: 'because…' },
      { key: 'effect', label: '…therefore' },
    ],
  },
  {
    id: 'ruguo-jiu',
    name: '如果…就',
    template: '如果/要是 + Condition，(Subject) 就 + Result',
    explanation: '"If A, then B." 的话 can be added after the condition: 如果…的话.',
    level: 'HSK2',
    promptHint: '如果/要是…就 conditional "if... then"',
    roles: [
      { key: 'condition', label: 'if…' },
      { key: 'result', label: '…then' },
    ],
  },
  {
    id: 'zhiyao-jiu',
    name: '只要…就',
    template: '只要 + Condition，就 + Result',
    explanation: '"As long as A, then B" — a sufficient condition. Compare 只有…才, which marks a necessary condition.',
    level: 'HSK3',
    promptHint: '只要…就 "as long as" sufficient condition',
    roles: [
      { key: 'condition', label: 'as long as…' },
      { key: 'result', label: '…then' },
    ],
  },
  {
    id: 'zhiyou-cai',
    name: '只有…才',
    template: '只有 + Condition，才 + Result',
    explanation: '"Only if A, then B" — the result happens only under this necessary condition.',
    level: 'HSK3',
    promptHint: '只有…才 "only if" necessary condition',
    roles: [
      { key: 'condition', label: 'only if…' },
      { key: 'result', label: '…only then' },
    ],
  },
  {
    id: 'budan-erqie',
    name: '不但…而且',
    template: '不但 + A，而且 (+ 也/还) + B',
    explanation: '"Not only A, but also B" — stacking two qualities or facts for emphasis.',
    level: 'HSK3',
    promptHint: '不但…而且 "not only... but also"',
    roles: [
      { key: 'first', label: 'not only…' },
      { key: 'second', label: '…but also' },
    ],
  },
  {
    id: 'bushi-ershi',
    name: '不是…而是',
    template: '不是 + A，而是 + B',
    explanation: '"It\'s not A, but rather B" — correcting or replacing one statement with another.',
    level: 'HSK3',
    promptHint: '不是…而是 "not A but rather B"',
    roles: [
      { key: 'rejected', label: 'not…' },
      { key: 'asserted', label: '…but rather' },
    ],
  },
  {
    id: 'chule-yiwai',
    name: '除了…以外',
    template: '除了 + X (+ 以外)，都/也/还 …',
    explanation: 'With 都: "except for X". With 也/还: "in addition to X". The follow-up adverb decides the meaning.',
    level: 'HSK3',
    promptHint: '除了…(以外) "except for / in addition to"',
    roles: [
      { key: 'excluded', label: 'apart from…' },
      { key: 'rest', label: '…the rest' },
    ],
  },
  {
    id: 'yue-yue',
    name: '越…越 / 越来越',
    template: '越 + A + 越 + B, or 越来越 + B',
    explanation: '越A越B means "the more A, the more B". 越来越 + adjective means something is increasingly so over time.',
    level: 'HSK3',
    promptHint: '越…越 "the more... the more", or 越来越 "more and more"',
    roles: [
      { key: 'driver', label: 'the more…' },
      { key: 'outcome', label: '…the more' },
    ],
  },
  {
    id: 'yi-jiu',
    name: '一…就',
    template: '一 + Trigger + 就 + Reaction',
    explanation: '一A就B means "as soon as A happens, B happens" — either habitually or for a one-off sequence.',
    level: 'HSK3',
    promptHint: '一…就 "as soon as / whenever"',
    roles: [
      { key: 'trigger', label: 'as soon as…' },
      { key: 'reaction', label: '…then' },
    ],
  },
  {
    id: 'lian-dou',
    name: '连…都/也',
    template: '连 + X + 都/也 + Statement',
    explanation: '连X都 means "even X" — highlighting an extreme case to make a stronger point.',
    level: 'HSK4',
    promptHint: '连…都/也 "even" for emphasis on extreme case',
    roles: [
      { key: 'extreme', label: 'even…' },
      { key: 'statement', label: '…still' },
    ],
  },
  // ── Two-part listings ────────────────────────────────────────────────────
  {
    id: 'you-you',
    name: '又…又',
    template: '又 + A + 又 + B',
    explanation: '又A又B means "both A and B", describing two simultaneous qualities or actions.',
    level: 'HSK2',
    promptHint: '又…又 "both... and"',
    roles: [
      { key: 'a', label: 'both…' },
      { key: 'b', label: '…and' },
    ],
  },
  {
    id: 'yibian-yibian',
    name: '一边…一边',
    template: '一边 + A + 一边 + B',
    explanation: 'Doing two actions at the same time: "while doing A, also doing B".',
    level: 'HSK2',
    promptHint: '一边…一边 simultaneous actions',
    roles: [
      { key: 'a', label: 'while…' },
      { key: 'b', label: '…also' },
    ],
  },
  {
    id: 'xian-ranhou',
    name: '先…然后',
    template: '先 + A，然后 (+ 再) + B',
    explanation: 'Sequencing actions: "first A, then B".',
    level: 'HSK2',
    promptHint: '先…然后/再 sequencing "first... then"',
    roles: [
      { key: 'first', label: 'first…' },
      { key: 'second', label: '…then' },
    ],
  },
  // ── Comparisons ──────────────────────────────────────────────────────────
  {
    id: 'bi-comparison',
    name: '比 comparison',
    template: 'A + 比 + B + Quality',
    explanation: 'A 比 B + adjective means "A is more [adjective] than B". Degree words like 更 or 多了 can modify the difference.',
    level: 'HSK2',
    promptHint: '比 comparison between two things',
    roles: [
      { key: 'a', label: 'comparing…' },
      { key: 'b', label: '…against' },
      { key: 'quality', label: 'on' },
    ],
  },
  {
    id: 'meiyou-comparison',
    name: '没有 comparison',
    template: 'A + 没有 + B (+ 那么/这么) + Quality',
    explanation: 'A 没有 B + adjective means "A is not as [adjective] as B" — the negative counterpart of 比.',
    level: 'HSK2',
    promptHint: '没有 used as "not as ... as" comparison (not simple negation)',
    roles: [
      { key: 'a', label: 'comparing…' },
      { key: 'b', label: '…against' },
      { key: 'quality', label: 'not as' },
    ],
  },
  {
    id: 'gen-yiyang',
    name: '跟…一样 comparison',
    template: 'A + 跟/和 + B + 一样 (+ Quality)',
    explanation: 'A 跟 B 一样 means "A is the same as B", optionally followed by an adjective: "A is as [adjective] as B".',
    level: 'HSK2',
    promptHint: '跟/和…一样 expressing sameness or equal degree',
    roles: [
      { key: 'a', label: 'comparing…' },
      { key: 'b', label: '…with' },
      { key: 'quality', label: 'equally' },
    ],
  },
  // ── Argument-structure constructions ─────────────────────────────────────
  {
    id: 'ba-construction',
    name: '把 construction',
    template: 'Subject + 把 + Object + Action',
    explanation: 'The 把 construction moves the object before the verb to emphasize what is done to it. The verb usually carries a complement or 了.',
    level: 'HSK3',
    promptHint: '把 moves the object before the verb (disposal construction)',
    roles: [
      { key: 'object', label: 'acted on' },
      { key: 'action', label: 'what happens to it' },
    ],
  },
  {
    id: 'bei-passive',
    name: '被 passive',
    template: 'Receiver + 被 (+ Agent) + Action',
    explanation: 'The 被 passive marks the subject as the receiver of the action. The agent after 被 is optional.',
    level: 'HSK3',
    promptHint: '被 passive voice marker',
    roles: [
      { key: 'receiver', label: 'affected' },
      { key: 'agent', label: 'by' },
      { key: 'action', label: 'what happened' },
    ],
  },
  {
    id: 'shi-de',
    name: '是…的 emphasis',
    template: 'Subject + 是 + [emphasized detail] + Verb + 的',
    explanation: 'The 是…的 pattern emphasizes details (time, place, manner) of a completed action rather than the action itself.',
    level: 'HSK2',
    promptHint: '是…的 emphasizing time/place/manner of a past action',
    roles: [{ key: 'emphasized', label: 'emphasized detail' }],
  },
  // ── Word-order structures ────────────────────────────────────────────────
  {
    id: 'topic-comment',
    name: 'Topic-comment structure',
    template: 'Topic，Comment',
    explanation: 'The topic is stated first, then a comment about it — even when the topic is the logical object: 这本书我看过 "this book, I\'ve read".',
    level: 'HSK3',
    promptHint: 'topic fronted before subject-verb comment (object preposed)',
    roles: [
      { key: 'topic', label: 'the topic' },
      { key: 'comment', label: 'what\'s said about it' },
    ],
  },
  {
    id: 'de-attributive',
    name: 'Attributive 的',
    template: 'Description + 的 + Noun',
    explanation: '的 links a modifier to a noun: 我买的书 "the book I bought". The whole phrase before 的 describes the noun — Chinese puts even long descriptions in front.',
    level: 'HSK1',
    promptHint: 'clause/phrase + 的 + noun (relative-clause-like modifier; only flag long/non-trivial modifiers)',
    roles: [
      { key: 'description', label: 'the description…' },
      { key: 'noun', label: '…describes this' },
    ],
  },
  {
    id: 'degree-complement',
    name: 'Degree complement with 得',
    template: 'Action + 得 + How',
    explanation: '得 after a verb introduces how the action is done: 说得很好 "speaks very well".',
    level: 'HSK2',
    promptHint: 'verb+得+adjective describing how an action is done',
    roles: [
      { key: 'action', label: 'the action' },
      { key: 'how', label: 'done how' },
    ],
  },
  {
    id: 'duration-complement',
    name: 'Duration complement',
    template: 'Action (+ 了) + Duration (+ Object)',
    explanation: 'Time duration goes after the verb, before the object: 学了三年中文 "studied Chinese for three years".',
    level: 'HSK2',
    promptHint: 'duration after verb stating how long an action lasts',
    roles: [
      { key: 'action', label: 'the action' },
      { key: 'duration', label: 'for how long' },
    ],
  },
];

const patternById = new Map(GRAMMAR_PATTERNS.map((p) => [p.id, p]));

export function getGrammarPattern(id: string): GrammarPattern | undefined {
  return patternById.get(id);
}

/**
 * Build the catalog section embedded in the v2 system prompt.
 * One line per pattern: "- id: hint (roles: a, b)".
 */
export function buildGrammarCatalogPromptSection(): string {
  return GRAMMAR_PATTERNS.map(
    (p) => `- ${p.id}: ${p.promptHint} (roles: ${p.roles.map((r) => r.key).join(', ')})`
  ).join('\n');
}

/**
 * Raw grammar point as emitted by the model.
 */
export interface RawGrammarPoint {
  patternId: string;
  roles: Record<string, number[]>;
}

/** A pattern role bound to this sentence's segments */
export interface HydratedGrammarRole {
  key: string;
  label: string;
  segmentIds: number[];
}

/**
 * Grammar point hydrated with catalog content for the client.
 */
export interface HydratedGrammarPoint {
  patternId: string;
  name: string;
  template: string;
  explanation: string;
  level: string;
  /** Roles in catalog display order; roles the model left unbound are omitted */
  roles: HydratedGrammarRole[];
}

function sanitizeSegmentIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is number => Number.isInteger(id) && id >= 0);
}

/**
 * Hydrate model-emitted grammar points against the catalog.
 * Unknown pattern IDs, unknown role keys, and points with no bound roles are
 * dropped (the model may only use catalog IDs and role keys; anything else is
 * a hallucination).
 */
export function hydrateGrammarPoints(raw: unknown): HydratedGrammarPoint[] {
  if (!Array.isArray(raw)) return [];

  const hydrated: HydratedGrammarPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { patternId, roles } = item as Partial<RawGrammarPoint>;
    if (typeof patternId !== 'string') continue;

    const pattern = patternById.get(patternId);
    if (!pattern) continue;
    if (!roles || typeof roles !== 'object') continue;

    const boundRoles: HydratedGrammarRole[] = [];
    for (const role of pattern.roles) {
      const segmentIds = sanitizeSegmentIds((roles as Record<string, unknown>)[role.key]);
      if (segmentIds.length === 0) continue;
      boundRoles.push({ key: role.key, label: role.label, segmentIds });
    }
    if (boundRoles.length === 0) continue;

    hydrated.push({
      patternId: pattern.id,
      name: pattern.name,
      template: pattern.template,
      explanation: pattern.explanation,
      level: pattern.level,
      roles: boundRoles,
    });
  }
  return hydrated;
}
