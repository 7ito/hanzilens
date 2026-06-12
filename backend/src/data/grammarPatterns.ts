/**
 * Grammar pattern catalog for the v2 parse pipeline.
 *
 * The LLM only ever emits pattern IDs (plus segment references); all displayed
 * content (name, template, explanation, level) is hydrated server-side from
 * this catalog. This keeps the model output small (fast streaming) and the
 * explanation content deterministic and hand-editable.
 *
 * `promptHint` is the one-line description embedded in the system prompt so
 * the model can recognize the pattern. Keep hints short: the catalog lives in
 * the static system prompt and benefits from provider prompt caching, but
 * there is no reason to waste tokens.
 */

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
}

export const GRAMMAR_PATTERNS: GrammarPattern[] = [
  {
    id: 'ba-construction',
    name: '把 construction',
    template: 'Subject + 把 + Object + Verb + complement',
    explanation: 'The 把 construction moves the object before the verb to emphasize what is done to it. The verb usually carries a complement or 了.',
    level: 'HSK3',
    promptHint: '把 moves the object before the verb (disposal construction)',
  },
  {
    id: 'bei-passive',
    name: '被 passive',
    template: 'Subject + 被 (+ agent) + Verb',
    explanation: 'The 被 passive marks the subject as the receiver of the action. The agent after 被 is optional.',
    level: 'HSK3',
    promptHint: '被 passive voice marker',
  },
  {
    id: 'shi-de',
    name: '是…的 emphasis',
    template: 'Subject + 是 + [time/place/manner] + Verb + 的',
    explanation: 'The 是…的 pattern emphasizes details (time, place, manner) of a completed action rather than the action itself.',
    level: 'HSK2',
    promptHint: '是…的 emphasizing time/place/manner of a past action',
  },
  {
    id: 'bi-comparison',
    name: '比 comparison',
    template: 'A + 比 + B + Adjective',
    explanation: 'A 比 B + adjective means "A is more [adjective] than B". Degree words like 更 or 多了 can modify the difference.',
    level: 'HSK2',
    promptHint: '比 comparison between two things',
  },
  {
    id: 'meiyou-comparison',
    name: '没有 comparison',
    template: 'A + 没有 + B (+ 那么/这么) + Adjective',
    explanation: 'A 没有 B + adjective means "A is not as [adjective] as B" — the negative counterpart of 比.',
    level: 'HSK2',
    promptHint: '没有 used as "not as ... as" comparison (not simple negation)',
  },
  {
    id: 'gen-yiyang',
    name: '跟…一样 comparison',
    template: 'A + 跟/和 + B + 一样 (+ Adjective)',
    explanation: 'A 跟 B 一样 means "A is the same as B", optionally followed by an adjective: "A is as [adjective] as B".',
    level: 'HSK2',
    promptHint: '跟/和…一样 expressing sameness or equal degree',
  },
  {
    id: 'yue-yue',
    name: '越…越 / 越来越',
    template: '越 + Verb + 越 + Adjective, or 越来越 + Adjective',
    explanation: '越A越B means "the more A, the more B". 越来越 + adjective means something is increasingly so over time.',
    level: 'HSK3',
    promptHint: '越…越 "the more... the more", or 越来越 "more and more"',
  },
  {
    id: 'yi-jiu',
    name: '一…就',
    template: '一 + Action 1 + 就 + Action 2',
    explanation: '一A就B means "as soon as A happens, B happens" — either habitually or for a one-off sequence.',
    level: 'HSK3',
    promptHint: '一…就 "as soon as / whenever"',
  },
  {
    id: 'lian-dou',
    name: '连…都/也',
    template: '连 + X + 都/也 + Verb',
    explanation: '连X都 means "even X" — highlighting an extreme case to make a stronger point.',
    level: 'HSK4',
    promptHint: '连…都/也 "even" for emphasis on extreme case',
  },
  {
    id: 'suiran-danshi',
    name: '虽然…但是',
    template: '虽然 + A，但是/可是 + B',
    explanation: '"Although A, (but) B." Unlike English, Chinese uses both 虽然 and 但是 in the same sentence.',
    level: 'HSK2',
    promptHint: '虽然…但是 "although... but"',
  },
  {
    id: 'yinwei-suoyi',
    name: '因为…所以',
    template: '因为 + Cause，所以 + Effect',
    explanation: '"Because A, therefore B." Both halves commonly appear together; either may also stand alone.',
    level: 'HSK2',
    promptHint: '因为…所以 cause and effect pair',
  },
  {
    id: 'ruguo-jiu',
    name: '如果…就',
    template: '如果/要是 + Condition，(Subject) 就 + Result',
    explanation: '"If A, then B." 的话 can be added after the condition: 如果…的话.',
    level: 'HSK2',
    promptHint: '如果/要是…就 conditional "if... then"',
  },
  {
    id: 'zhiyao-jiu',
    name: '只要…就',
    template: '只要 + Condition，就 + Result',
    explanation: '"As long as A, then B" — a sufficient condition. Compare 只有…才, which marks a necessary condition.',
    level: 'HSK3',
    promptHint: '只要…就 "as long as" sufficient condition',
  },
  {
    id: 'zhiyou-cai',
    name: '只有…才',
    template: '只有 + Condition，才 + Result',
    explanation: '"Only if A, then B" — the result happens only under this necessary condition.',
    level: 'HSK3',
    promptHint: '只有…才 "only if" necessary condition',
  },
  {
    id: 'budan-erqie',
    name: '不但…而且',
    template: '不但 + A，而且 (+ 也/还) + B',
    explanation: '"Not only A, but also B" — stacking two qualities or facts for emphasis.',
    level: 'HSK3',
    promptHint: '不但…而且 "not only... but also"',
  },
  {
    id: 'bushi-ershi',
    name: '不是…而是',
    template: '不是 + A，而是 + B',
    explanation: '"It\'s not A, but rather B" — correcting or replacing one statement with another.',
    level: 'HSK3',
    promptHint: '不是…而是 "not A but rather B"',
  },
  {
    id: 'chule-yiwai',
    name: '除了…以外',
    template: '除了 + X (+ 以外)，都/也/还 …',
    explanation: 'With 都: "except for X". With 也/还: "in addition to X". The follow-up adverb decides the meaning.',
    level: 'HSK3',
    promptHint: '除了…(以外) "except for / in addition to"',
  },
  {
    id: 'you-you',
    name: '又…又',
    template: '又 + Adjective/Verb + 又 + Adjective/Verb',
    explanation: '又A又B means "both A and B", describing two simultaneous qualities or actions.',
    level: 'HSK2',
    promptHint: '又…又 "both... and"',
  },
  {
    id: 'yibian-yibian',
    name: '一边…一边',
    template: '一边 + Action 1 + 一边 + Action 2',
    explanation: 'Doing two actions at the same time: "while doing A, also doing B".',
    level: 'HSK2',
    promptHint: '一边…一边 simultaneous actions',
  },
  {
    id: 'xian-ranhou',
    name: '先…然后',
    template: '先 + Action 1，然后 (+ 再) + Action 2',
    explanation: 'Sequencing actions: "first A, then B".',
    level: 'HSK2',
    promptHint: '先…然后/再 sequencing "first... then"',
  },
  {
    id: 'le-completed',
    name: 'Aspect 了 (completed action)',
    template: 'Verb + 了 (+ Object)',
    explanation: '了 directly after the verb marks the action as completed. It is not a general past tense marker.',
    level: 'HSK1',
    promptHint: 'verb+了 marking completed action (aspect)',
  },
  {
    id: 'le-change',
    name: 'Sentence-final 了 (change of state)',
    template: 'Sentence + 了',
    explanation: '了 at the end of a sentence signals a new situation or change of state: "now it\'s the case that...".',
    level: 'HSK1',
    promptHint: 'sentence-final 了 marking change of state / new situation',
  },
  {
    id: 'guo-experience',
    name: 'Experiential 过',
    template: 'Verb + 过',
    explanation: '过 after a verb means the action has been experienced at least once before: "have ever done".',
    level: 'HSK2',
    promptHint: 'verb+过 "have done before" experience marker',
  },
  {
    id: 'zhe-continuous',
    name: 'Continuous 着',
    template: 'Verb + 着',
    explanation: '着 marks an ongoing state or background action, e.g. 开着 "is open", 听着音乐做饭 "cooks while listening to music".',
    level: 'HSK2',
    promptHint: 'verb+着 continuous state marker',
  },
  {
    id: 'zai-progressive',
    name: 'Progressive 在/正在',
    template: 'Subject + 在/正在 + Verb',
    explanation: '在 or 正在 before a verb marks an action in progress right now: "is ...-ing".',
    level: 'HSK1',
    promptHint: '在/正在+verb progressive "is doing"',
  },
  {
    id: 'kuaiyao-le',
    name: 'Imminent 快要…了',
    template: '快(要)/就要 + Verb/Adjective + 了',
    explanation: 'Something is about to happen: "soon, almost".',
    level: 'HSK2',
    promptHint: '快要/就要…了 "about to happen"',
  },
  {
    id: 'resultative-complement',
    name: 'Resultative complement',
    template: 'Verb + result (完/好/到/见/懂/错/会…)',
    explanation: 'A second syllable after the verb states the result: 听懂 "listen and understand", 找到 "look and find", 写完 "finish writing".',
    level: 'HSK2',
    promptHint: 'verb + resultative complement (完/好/到/见/懂/错…)',
  },
  {
    id: 'directional-complement',
    name: 'Directional complement',
    template: 'Verb + 来/去 (or 上来/出去/起来…)',
    explanation: 'Direction words after the verb show movement relative to the speaker: 进来 "come in", 拿出去 "take out".',
    level: 'HSK2',
    promptHint: 'verb + directional complement (来/去/上来/出去/起来…)',
  },
  {
    id: 'potential-complement',
    name: 'Potential complement',
    template: 'Verb + 得/不 + complement',
    explanation: '得 or 不 between verb and complement expresses ability: 听得懂 "able to understand", 买不起 "can\'t afford".',
    level: 'HSK3',
    promptHint: 'verb+得/不+complement expressing possibility (听得懂/买不起)',
  },
  {
    id: 'degree-complement',
    name: 'Degree complement with 得',
    template: 'Verb + 得 + Adjective phrase',
    explanation: '得 after a verb introduces how the action is done: 说得很好 "speaks very well".',
    level: 'HSK2',
    promptHint: 'verb+得+adjective describing how an action is done',
  },
  {
    id: 'duration-complement',
    name: 'Duration complement',
    template: 'Verb (+ 了) + duration (+ Object)',
    explanation: 'Time duration after the verb states how long the action lasts: 学了三年中文 "studied Chinese for three years".',
    level: 'HSK2',
    promptHint: 'duration after verb stating how long an action lasts',
  },
  {
    id: 'de-attributive',
    name: 'Attributive 的',
    template: 'Modifier + 的 + Noun',
    explanation: '的 links a modifier to a noun: 红色的车 "a red car", 我买的书 "the book I bought". The whole phrase before 的 describes the noun.',
    level: 'HSK1',
    promptHint: 'clause/phrase + 的 + noun (relative-clause-like modifier; only flag non-trivial uses)',
  },
  {
    id: 'de-adverbial',
    name: 'Adverbial 地',
    template: 'Adjective + 地 + Verb',
    explanation: '地 turns an adjective into an adverb modifying the verb: 慢慢地走 "walk slowly".',
    level: 'HSK3',
    promptHint: 'adjective+地+verb adverbial marker',
  },
  {
    id: 'verb-reduplication',
    name: 'Verb reduplication',
    template: 'Verb + Verb / Verb + 一 + Verb',
    explanation: 'Repeating a verb (看看, 试一试) softens it: "take a look", "give it a try".',
    level: 'HSK2',
    promptHint: 'reduplicated verb (看看/试一试) softening the action',
  },
  {
    id: 'a-not-a',
    name: 'A-not-A question',
    template: 'Verb + 不 + Verb / Adjective + 不 + Adjective',
    explanation: 'Repeating the verb with 不 in between forms a yes/no question: 去不去 "going or not?". Do not combine with 吗.',
    level: 'HSK1',
    promptHint: 'A-not-A question form (是不是/去不去/好不好)',
  },
  {
    id: 'topic-comment',
    name: 'Topic-comment structure',
    template: 'Topic，Comment',
    explanation: 'The topic is stated first, then a comment about it — even when the topic is the logical object: 这本书我看过 "this book, I\'ve read".',
    level: 'HSK3',
    promptHint: 'topic fronted before subject-verb comment (object preposed)',
  },
  {
    id: 'youdian',
    name: '有点(儿) + adjective',
    template: '有点(儿) + Adjective',
    explanation: '有点 before an adjective means "a bit (too)...", usually with a negative or complaining tone.',
    level: 'HSK2',
    promptHint: '有点(儿)+adjective "a bit (undesirably)..."',
  },
  {
    id: 'cai-emphasis',
    name: '才 (later/only then)',
    template: '… 才 + Verb',
    explanation: '才 signals that something happens later or under stricter conditions than expected: 十点才起床 "didn\'t get up until ten".',
    level: 'HSK2',
    promptHint: '才 marking "only then / as late as / not until"',
  },
  {
    id: 'jiu-emphasis',
    name: '就 (sooner/right away)',
    template: '… 就 + Verb',
    explanation: '就 signals that something happens sooner or more easily than expected: 六点就起床了 "got up as early as six".',
    level: 'HSK2',
    promptHint: '就 marking "as early as / right away / then" (only when load-bearing)',
  },
  {
    id: 'shi-bu-shi',
    name: '是不是 confirmation',
    template: '是不是 + statement / statement + 是不是',
    explanation: '是不是 seeks confirmation of the whole statement: "isn\'t it the case that...?".',
    level: 'HSK2',
    promptHint: '是不是 seeking confirmation of a statement',
  },
  {
    id: 'nandao',
    name: 'Rhetorical 难道',
    template: '难道 + statement + 吗？',
    explanation: '难道 turns a question rhetorical, expressing disbelief: "don\'t tell me that...?".',
    level: 'HSK4',
    promptHint: '难道 rhetorical question of disbelief',
  },
  {
    id: 'measure-word',
    name: 'Measure word',
    template: 'Number/这/那 + Measure word + Noun',
    explanation: 'Nouns are counted through a measure word matched to the noun type: 一本书, 三只猫. Flag uncommon measure words, not 个.',
    level: 'HSK1',
    promptHint: 'notable measure word usage (only flag non-个 measure words)',
  },
];

const patternById = new Map(GRAMMAR_PATTERNS.map((p) => [p.id, p]));

export function getGrammarPattern(id: string): GrammarPattern | undefined {
  return patternById.get(id);
}

/**
 * Build the catalog section embedded in the v2 system prompt.
 * One line per pattern: "- id: hint".
 */
export function buildGrammarCatalogPromptSection(): string {
  return GRAMMAR_PATTERNS.map((p) => `- ${p.id}: ${p.promptHint}`).join('\n');
}

/**
 * Raw grammar point as emitted by the model.
 */
export interface RawGrammarPoint {
  patternId: string;
  segmentIds: number[];
}

/**
 * Grammar point hydrated with catalog content for the client.
 */
export interface HydratedGrammarPoint {
  patternId: string;
  segmentIds: number[];
  name: string;
  template: string;
  explanation: string;
  level: string;
}

/**
 * Hydrate model-emitted grammar points against the catalog.
 * Unknown pattern IDs and malformed entries are dropped (the model is only
 * allowed to use catalog IDs; anything else is a hallucination).
 */
export function hydrateGrammarPoints(raw: unknown): HydratedGrammarPoint[] {
  if (!Array.isArray(raw)) return [];

  const hydrated: HydratedGrammarPoint[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const { patternId, segmentIds } = item as Partial<RawGrammarPoint>;
    if (typeof patternId !== 'string') continue;

    const pattern = patternById.get(patternId);
    if (!pattern) continue;

    const ids = Array.isArray(segmentIds)
      ? segmentIds.filter((id): id is number => Number.isInteger(id) && id >= 0)
      : [];
    if (ids.length === 0) continue;

    hydrated.push({
      patternId: pattern.id,
      segmentIds: ids,
      name: pattern.name,
      template: pattern.template,
      explanation: pattern.explanation,
      level: pattern.level,
    });
  }
  return hydrated;
}
