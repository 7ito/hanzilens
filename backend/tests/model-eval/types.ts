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
 * Response from /eval/parse endpoint (two-stage pipeline)
 */
export interface EvalParseResponse {
  segmentationModel: string;
  alignmentModel: string;
  provider: string | null;
  result: EvalParseResult;
  alignmentValidation: AlignmentValidation | null;
  usage: TwoStageUsage;
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
 * Token usage for two-stage pipeline
 */
export interface TwoStageUsage {
  segmentation: TokenUsage;
  alignment: TokenUsage | null;
  total: TokenUsage;
}

/**
 * Alignment validation result from /eval/parse
 */
export interface AlignmentValidation {
  isValid: boolean;
  reconstructionMatches: boolean;
  segmentIdsValid: boolean;
}

/**
 * Evaluation result for a single sentence
 */
export interface SentenceResult {
  sentenceId: string;
  input: string;
  category: SentenceCategory;
  responseTimeMs: number;
  tokensUsed?: TwoStageUsage;  // Now uses two-stage usage
  success: boolean;
  parseError?: string;
  parseResult?: ParseResponse;
  segmentEvaluations: SegmentEvaluation[];
  alignmentValidation?: AlignmentValidation;  // Alignment quality for this sentence
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
 * Details about a specific pinyin correction
 */
export interface PinyinCorrectionDetail {
  token: string;
  rawPinyin: string;
  correctedPinyin: string;
  /** Whether the correction improved accuracy (based on CC-CEDICT) */
  wasImprovement: boolean;
  /** Whether the correction degraded accuracy (raw was valid, corrected is invalid) */
  wasDegradation: boolean;
  /** The sentence this correction occurred in */
  sentenceId: string;
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
  /** Detailed breakdown of corrections (improvements vs degradations) */
  correctionDetails?: {
    improvements: number;
    degradations: number;
    neutral: number;  // Changed but neither improved nor degraded (both valid or both invalid)
    /** Sample of degradations for debugging (limited to 20) */
    sampleDegradations: PinyinCorrectionDetail[];
  };
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
 * Alignment quality statistics
 */
export interface AlignmentStats {
  /** Total sentences with alignment results */
  total: number;
  /** Valid alignments (reconstruction matches + valid IDs) */
  valid: number;
  /** Invalid alignments */
  invalid: number;
  /** Validity rate: valid / total */
  validRate: number;
  /** Count of reconstruction failures */
  reconstructionFailures: number;
  /** Count of invalid segment ID references */
  segmentIdFailures: number;
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
  alignmentStats?: AlignmentStats;   // Alignment quality metrics (two-stage pipeline)
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
  serverUrl: string;   // Backend server URL used for evaluation
  provider?: string;   // OpenRouter provider used (if specified)
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
  provider?: string;         // Optional OpenRouter provider slug (e.g., 'fireworks', 'together')
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

// ============================================================================
// TIMING BENCHMARK TYPES
// ============================================================================

/**
 * Timing result for a single sentence
 */
export interface SentenceTimingResult {
  sentence: string;
  
  /** Monolithic approach timing (single model call with full prompt) */
  monolithic: {
    totalMs: number;
    tokens: TokenUsage;
    success: boolean;
    error?: string;
  };
  
  /** Two-stage pipeline timing */
  twoStage: {
    segmentationMs: number;
    alignmentMs: number;
    totalMs: number;
    segmentationTokens: TokenUsage;
    alignmentTokens: TokenUsage | null;
    success: boolean;
    error?: string;
  };
}

/**
 * Percentile statistics for timing
 */
export interface TimingPercentiles {
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
}

/**
 * Summary statistics for the benchmark
 */
export interface TimingBenchmarkSummary {
  sentenceCount: number;
  warmupCount: number;
  
  /** Monolithic approach stats */
  monolithic: {
    timing: TimingPercentiles;
    successRate: number;
    avgTokens: TokenUsage;
  };
  
  /** Two-stage pipeline stats */
  twoStage: {
    segmentationTiming: TimingPercentiles;
    alignmentTiming: TimingPercentiles;
    totalTiming: TimingPercentiles;
    successRate: number;
    avgSegmentationTokens: TokenUsage;
    avgAlignmentTokens: TokenUsage | null;
  };
  
  /** Comparison metrics */
  comparison: {
    /** monolithic.avg / twoStage.avg (>1 means two-stage is faster) */
    speedupFactor: number;
    /** Percentage of two-stage time spent in segmentation */
    segmentationPct: number;
    /** Percentage of two-stage time spent in alignment */
    alignmentPct: number;
  };
}

/**
 * Full benchmark result
 */
export interface TimingBenchmarkResult {
  timestamp: string;
  
  /** Models used */
  models: {
    monolithic: string;
    segmentation: string;
    alignment: string;
  };
  
  /** Individual sentence results */
  sentences: SentenceTimingResult[];
  
  /** Aggregated summary */
  summary: TimingBenchmarkSummary;
}

/**
 * Options for running the timing benchmark
 */
export interface TimingBenchmarkOptions {
  /** Model for monolithic approach */
  monolithicModel: string;
  /** Model for segmentation stage */
  segmentationModel: string;
  /** Model for alignment stage */
  alignmentModel: string;
  /** Sentences to benchmark */
  sentences: string[];
  /** Number of warmup requests (not counted in stats) */
  warmupCount?: number;
  /** Progress callback */
  onProgress?: (phase: string, current: number, total: number) => void;
}
