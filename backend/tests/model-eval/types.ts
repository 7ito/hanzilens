/**
 * Types for the model evaluation test suite
 */

import type { ParseResponse, ParsedSegment, DictionaryEntry } from '../../src/types/index.js';

// Re-export for convenience
export type { ParseResponse, ParsedSegment, DictionaryEntry };

/**
 * Segment with both raw AI pinyin and corrected pinyin
 */
export interface EvalSegment {
  id: number;
  token: string;
  rawPinyin: string;       // Original pinyin from AI model
  correctedPinyin: string; // Pinyin after pinyin-pro correction
  pinyin: string;          // Final pinyin (same as correctedPinyin)
  definition: string;
}

/**
 * Parse result from /eval/parse endpoint
 */
export interface EvalParseResult {
  translation: string;
  segments: EvalSegment[];
  translationParts: Array<{
    text: string;
    segmentIds: number[];
  }>;
}

/**
 * Response from /eval/parse endpoint
 */
export interface EvalParseResponse {
  model: string;
  result: EvalParseResult;
  usage: {
    prompt: number;
    completion: number;
    total: number;
  };
}

/**
 * Test sentence categories for targeting specific language features
 */
export type SentenceCategory =
  | 'basic'        // Common phrases, simple grammar
  | 'homophone'    // Words with multiple readings (了, 得, 地)
  | 'tone-sandhi'  // Tone changes (不, 一)
  | 'u-umlaut'     // Words with ü (女, 绿, 旅)
  | 'compound'     // Multi-character compound words
  | 'proper-noun'  // Names, places
  | 'literary'     // Classical/formal Chinese
  | 'mixed'        // Numbers, dates, mixed content
  | 'slang';       // Internet slang, colloquialisms

/**
 * A test sentence with metadata
 */
export interface TestSentence {
  id: string;
  text: string;
  category: SentenceCategory;
  /** Optional notes about expected tricky parts */
  notes?: string;
  /** Optional expected English translation for reference */
  expectedTranslation?: string;
}

/**
 * How the pinyin was matched (or not matched)
 */
export type PinyinMatchType =
  | 'exact'         // Exact match after normalization
  | 'not-found'     // Token not in CC-CEDICT (proper nouns, new words)
  | 'empty-pinyin'  // Empty pinyin is valid (punctuation, numbers, English)
  | 'invalid';      // Pinyin doesn't match any valid reading

/**
 * Result of validating a segment's pinyin against CC-CEDICT
 */
export interface PinyinValidationResult {
  token: string;
  aiPinyin: string;
  isValid: boolean;
  matchType: PinyinMatchType;
  /** The CC-CEDICT reading that matched (if any) */
  matchedReading?: string;
  /** All valid readings from CC-CEDICT for this token */
  allValidReadings: string[];
}

/**
 * Semantic judgment rating from the judge model
 */
export type SemanticRating = 'CORRECT' | 'ACCEPTABLE' | 'INCORRECT';

/**
 * Semantic judgment from the judge model (Qwen3-Max)
 */
export interface SemanticJudgment {
  rating: SemanticRating;
  explanation: string;
}

/**
 * Evaluation result for a single segment
 */
export interface SegmentEvaluation {
  segmentId: number;
  token: string;
  rawPinyin: string;        // Original pinyin from AI model
  correctedPinyin: string;  // Pinyin after pinyin-pro correction
  aiPinyin: string;         // Alias for correctedPinyin (for backward compatibility)
  aiDefinition: string;
  pinyinValidation: PinyinValidationResult;
  rawPinyinValidation?: PinyinValidationResult;  // Validation of raw AI pinyin (before correction)
  semanticJudgment?: SemanticJudgment;
}

/**
 * Token usage information from OpenRouter
 */
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

/**
 * Evaluation result for a single sentence
 */
export interface SentenceResult {
  sentenceId: string;
  input: string;
  category: SentenceCategory;
  responseTimeMs: number;
  tokensUsed?: TokenUsage;
  success: boolean;
  parseError?: string;
  parseResult?: ParseResponse;
  segmentEvaluations: SegmentEvaluation[];
}

/**
 * Pinyin accuracy statistics
 */
export interface PinyinStats {
  /** Segments with valid pinyin (matched CC-CEDICT) */
  valid: number;
  /** Segments with invalid pinyin (didn't match any reading) */
  invalid: number;
  /** Segments where token wasn't in CC-CEDICT */
  notInDictionary: number;
  /** Segments with empty pinyin (punctuation, numbers, English) */
  emptyPinyin: number;
  /** Accuracy: valid / (valid + invalid) - excludes not-found and empty */
  accuracy: number;
}

/**
 * Combined pinyin statistics showing both raw AI and corrected accuracy
 */
export interface CombinedPinyinStats {
  /** Stats for pinyin after pinyin-pro correction (what users see) */
  corrected: PinyinStats;
  /** Stats for raw AI pinyin before correction (model quality) */
  raw: PinyinStats;
  /** Number of segments where correction changed the pinyin */
  correctionsMade: number;
}

/**
 * Semantic evaluation statistics
 */
export interface SemanticStats {
  correct: number;
  acceptable: number;
  incorrect: number;
  /** Score: (correct + acceptable) / total */
  score: number;
}

/**
 * Response time statistics
 */
export interface TimingStats {
  avgResponseMs: number;
  minResponseMs: number;
  maxResponseMs: number;
  totalMs: number;
}

/**
 * Cost estimation
 */
export interface CostStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Estimated cost in USD (if pricing available) */
  estimatedUsd?: number;
}

/**
 * Summary statistics for an evaluation run
 */
export interface EvaluationSummary {
  totalSentences: number;
  successfulParses: number;
  failedParses: number;
  totalSegments: number;
  pinyinStats: CombinedPinyinStats;  // Now includes both raw and corrected stats
  semanticStats?: SemanticStats;
  timing: TimingStats;
  cost?: CostStats;
}

/**
 * Configuration used for an evaluation run
 */
export interface EvaluationConfig {
  sentenceCount: number;
  semanticJudgingEnabled: boolean;
  judgeModel?: string;
  serverUrl: string;  // Backend server URL used for evaluation
}

/**
 * Full evaluation result for a model
 */
export interface EvaluationResult {
  modelId: string;
  timestamp: string;
  config: EvaluationConfig;
  summary: EvaluationSummary;
  sentences: SentenceResult[];
}

/**
 * Options for running an evaluation
 */
export interface EvalOptions {
  modelId: string;           // Model to evaluate (OpenRouter slug)
  serverUrl: string;         // Backend server URL
  sentences: TestSentence[];
  enableSemanticJudging: boolean;
  /** Callback for progress updates */
  onProgress?: (completed: number, total: number, currentSentence: string) => void;
}

/**
 * Input for semantic judgment (sent to judge model)
 */
export interface SemanticJudgmentInput {
  sentence: string;
  segments: Array<{
    token: string;
    aiDefinition: string;
    dictDefinitions: string[];
  }>;
}

/**
 * Raw response from judge model (before parsing)
 */
export interface SemanticJudgmentResponse {
  rating: string;
  explanation: string;
}
