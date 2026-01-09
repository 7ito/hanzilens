/**
 * Core evaluation orchestration
 * 
 * Coordinates parsing via /eval/parse endpoint, pinyin validation, and semantic judging.
 * Now tests the full production pipeline including pinyin-pro correction.
 */

import { getDatabase } from '../../src/services/dictionary.js';
import { validateSegmentPinyin, calculatePinyinStats } from './pinyin-validator.js';
import { judgeSegmentsBatched, calculateSemanticStats } from './semantic-judge.js';
import type {
  TestSentence,
  EvalOptions,
  EvaluationResult,
  EvaluationSummary,
  SentenceResult,
  SegmentEvaluation,
  TokenUsage,
  EvalParseResponse,
  EvalSegment,
  CombinedPinyinStats,
  PinyinStats,
  PinyinCorrectionDetail,
} from './types.js';

const DEFAULT_SERVER_URL = 'http://localhost:5000';

/**
 * Check if the server is running and healthy
 */
export async function checkServerHealth(serverUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${serverUrl}/`, { 
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Parse a sentence via the /eval/parse endpoint
 * 
 * This calls the full production pipeline including pinyin-pro correction.
 */
async function parseViaEndpoint(
  serverUrl: string,
  modelId: string,
  sentence: string,
  provider?: string
): Promise<{ 
  segments: EvalSegment[];
  translation: string;
  translationParts: Array<{ text: string; segmentIds: number[] }>;
  usage: TokenUsage;
}> {
  const response = await fetch(`${serverUrl}/eval/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence, model: modelId, provider }),
    signal: AbortSignal.timeout(90000),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `Server error: ${response.status}`);
  }

  const data = await response.json() as EvalParseResponse;

  return {
    segments: data.result.segments,
    translation: data.result.translation,
    translationParts: data.result.translationParts,
    usage: {
      prompt: data.usage.prompt,
      completion: data.usage.completion,
      total: data.usage.total,
    },
  };
}

/**
 * Evaluate a single sentence
 */
async function evaluateSentence(
  serverUrl: string,
  modelId: string,
  sentence: TestSentence,
  provider?: string
): Promise<SentenceResult> {
  const startTime = performance.now();

  let parseResult: {
    translation: string;
    segments: EvalSegment[];
    translationParts: Array<{ text: string; segmentIds: number[] }>;
  } | undefined;
  let parseError: string | undefined;
  let tokensUsed: TokenUsage | undefined;

  try {
    const result = await parseViaEndpoint(serverUrl, modelId, sentence.text, provider);
    parseResult = {
      translation: result.translation,
      segments: result.segments,
      translationParts: result.translationParts,
    };
    tokensUsed = result.usage;
  } catch (error) {
    parseError = error instanceof Error ? error.message : 'Unknown error';
  }

  const responseTimeMs = performance.now() - startTime;

  // Build segment evaluations with both raw and corrected pinyin validation
  const segmentEvaluations: SegmentEvaluation[] = [];

  if (parseResult) {
    for (const segment of parseResult.segments) {
      // Validate corrected pinyin (what users see)
      const pinyinValidation = validateSegmentPinyin(segment.token, segment.correctedPinyin);
      
      // Also validate raw AI pinyin (model quality)
      const rawPinyinValidation = validateSegmentPinyin(segment.token, segment.rawPinyin);

      segmentEvaluations.push({
        segmentId: segment.id,
        token: segment.token,
        rawPinyin: segment.rawPinyin,
        correctedPinyin: segment.correctedPinyin,
        aiPinyin: segment.correctedPinyin,  // For backward compatibility
        aiDefinition: segment.definition,
        pinyinValidation,
        rawPinyinValidation,
        // semanticJudgment will be added later if enabled
      });
    }
  }

  return {
    sentenceId: sentence.id,
    input: sentence.text,
    category: sentence.category,
    responseTimeMs,
    tokensUsed,
    success: !parseError,
    parseError,
    parseResult: parseResult ? {
      translation: parseResult.translation,
      segments: parseResult.segments.map(s => ({
        id: s.id,
        token: s.token,
        pinyin: s.correctedPinyin,
        definition: s.definition,
      })),
      translationParts: parseResult.translationParts,
    } : undefined,
    segmentEvaluations,
  };
}

/**
 * Calculate combined pinyin stats for both raw and corrected pinyin
 */
function calculateCombinedPinyinStats(
  evaluations: SegmentEvaluation[],
  sentenceResults: SentenceResult[]
): CombinedPinyinStats {
  // Stats for corrected pinyin (production behavior)
  const correctedValidations = evaluations.map(e => e.pinyinValidation);
  const correctedStats = calculatePinyinStats(correctedValidations);

  // Stats for raw AI pinyin (model quality)
  const rawValidations = evaluations
    .filter(e => e.rawPinyinValidation)
    .map(e => e.rawPinyinValidation!);
  const rawStats = calculatePinyinStats(rawValidations);

  // Build a map of segmentId to sentenceId for correction details
  const segmentToSentence = new Map<string, string>();
  for (const sr of sentenceResults) {
    for (const seg of sr.segmentEvaluations) {
      // Use a composite key since segmentId is per-sentence
      segmentToSentence.set(`${sr.sentenceId}:${seg.segmentId}`, sr.sentenceId);
    }
  }

  // Analyze corrections in detail
  let improvements = 0;
  let degradations = 0;
  let neutral = 0;
  const sampleDegradations: PinyinCorrectionDetail[] = [];

  // Track which sentence each evaluation belongs to
  let evalIndex = 0;
  for (const sr of sentenceResults) {
    for (const e of sr.segmentEvaluations) {
      if (e.rawPinyin !== e.correctedPinyin && e.correctedPinyin !== '') {
        const rawWasValid = e.rawPinyinValidation?.isValid ?? false;
        const correctedIsValid = e.pinyinValidation.isValid;

        const detail: PinyinCorrectionDetail = {
          token: e.token,
          rawPinyin: e.rawPinyin,
          correctedPinyin: e.correctedPinyin,
          wasImprovement: !rawWasValid && correctedIsValid,
          wasDegradation: rawWasValid && !correctedIsValid,
          sentenceId: sr.sentenceId,
        };

        if (!rawWasValid && correctedIsValid) {
          improvements++;
        } else if (rawWasValid && !correctedIsValid) {
          degradations++;
          // Keep sample of degradations for debugging
          if (sampleDegradations.length < 20) {
            sampleDegradations.push(detail);
          }
        } else {
          neutral++;
        }
      }
      evalIndex++;
    }
  }

  // Count how many corrections were made
  const correctionsMade = improvements + degradations + neutral;

  return {
    corrected: correctedStats,
    raw: rawStats,
    correctionsMade,
    correctionDetails: {
      improvements,
      degradations,
      neutral,
      sampleDegradations,
    },
  };
}

/**
 * Calculate summary statistics from sentence results
 */
function calculateSummary(
  sentences: SentenceResult[],
  semanticEnabled: boolean
): EvaluationSummary {
  const successfulParses = sentences.filter(s => s.success).length;
  const failedParses = sentences.length - successfulParses;

  // Collect all segment evaluations
  const allEvaluations: SegmentEvaluation[] = [];
  for (const s of sentences) {
    allEvaluations.push(...s.segmentEvaluations);
  }

  // Pinyin stats (now includes both raw and corrected, plus correction details)
  const pinyinStats = calculateCombinedPinyinStats(allEvaluations, sentences);

  // Semantic stats (if enabled)
  const semanticStats = semanticEnabled ? calculateSemanticStats(allEvaluations) : undefined;

  // Timing stats
  const responseTimes = sentences.map(s => s.responseTimeMs);
  const totalMs = responseTimes.reduce((a, b) => a + b, 0);
  const avgResponseMs = sentences.length > 0 ? totalMs / sentences.length : 0;
  const minResponseMs = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
  const maxResponseMs = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;

  // Cost stats
  let cost = undefined;
  const tokensData = sentences.filter(s => s.tokensUsed).map(s => s.tokensUsed!);
  if (tokensData.length > 0) {
    const promptTokens = tokensData.reduce((a, b) => a + b.prompt, 0);
    const completionTokens = tokensData.reduce((a, b) => a + b.completion, 0);
    cost = {
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
    };
  }

  return {
    totalSentences: sentences.length,
    successfulParses,
    failedParses,
    totalSegments: allEvaluations.length,
    pinyinStats,
    semanticStats,
    timing: {
      avgResponseMs,
      minResponseMs,
      maxResponseMs,
      totalMs,
    },
    cost,
  };
}

/**
 * Run evaluation for a model
 */
export async function evaluateModel(options: EvalOptions): Promise<EvaluationResult> {
  const { modelId, serverUrl, provider, sentences, enableSemanticJudging, onProgress } = options;

  // Ensure database is initialized (for pinyin validation)
  getDatabase();

  console.log(`\nEvaluating model: ${modelId}`);
  if (provider) {
    console.log(`Provider: ${provider}`);
  }
  console.log(`Server: ${serverUrl}`);
  console.log(`Sentences: ${sentences.length}`);
  console.log(`Semantic judging: ${enableSemanticJudging ? 'enabled' : 'disabled'}`);
  console.log('');

  // Evaluate each sentence
  const results: SentenceResult[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];

    onProgress?.(i + 1, sentences.length, sentence.text);

    const result = await evaluateSentence(serverUrl, modelId, sentence, provider);
    results.push(result);

    // Small delay between requests
    if (i < sentences.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Run semantic judging if enabled
  if (enableSemanticJudging) {
    console.log('\nRunning semantic evaluation...');
    await judgeSegmentsBatched(results, (completed, total, sentence) => {
      const truncated = sentence.length > 30 ? sentence.slice(0, 30) + '...' : sentence;
      process.stdout.write(`\r  Judging [${completed}/${total}]: ${truncated}`.padEnd(70));
    });
    process.stdout.write('\r' + ' '.repeat(70) + '\r'); // Clear line
  }

  // Calculate summary
  const summary = calculateSummary(results, enableSemanticJudging);

  return {
    modelId,
    timestamp: new Date().toISOString(),
    config: {
      sentenceCount: sentences.length,
      semanticJudgingEnabled: enableSemanticJudging,
      judgeModel: enableSemanticJudging ? 'qwen/qwen3-max' : undefined,
      serverUrl,
      provider,
    },
    summary,
    sentences: results,
  };
}

/**
 * Print a summary of the evaluation results
 */
export function printSummary(result: EvaluationResult): void {
  const { summary } = result;

  console.log('\n' + '='.repeat(60));
  console.log(`MODEL: ${result.modelId}`);
  console.log('='.repeat(60));

  console.log(`\nParsing:`);
  console.log(`  Successful: ${summary.successfulParses}/${summary.totalSentences}`);
  console.log(`  Failed: ${summary.failedParses}`);
  console.log(`  Total segments: ${summary.totalSegments}`);

  console.log(`\nPinyin Accuracy (after correction):`);
  console.log(`  Valid: ${summary.pinyinStats.corrected.valid}`);
  console.log(`  Invalid: ${summary.pinyinStats.corrected.invalid}`);
  console.log(`  Not in dictionary: ${summary.pinyinStats.corrected.notInDictionary}`);
  console.log(`  Empty (punct/num): ${summary.pinyinStats.corrected.emptyPinyin}`);
  console.log(`  Accuracy: ${(summary.pinyinStats.corrected.accuracy * 100).toFixed(1)}%`);

  console.log(`\nPinyin Accuracy (raw AI output):`);
  console.log(`  Valid: ${summary.pinyinStats.raw.valid}`);
  console.log(`  Invalid: ${summary.pinyinStats.raw.invalid}`);
  console.log(`  Accuracy: ${(summary.pinyinStats.raw.accuracy * 100).toFixed(1)}%`);
  console.log(`  Corrections made: ${summary.pinyinStats.correctionsMade}`);

  // Show correction breakdown if available
  if (summary.pinyinStats.correctionDetails) {
    const { improvements, degradations, neutral, sampleDegradations } = summary.pinyinStats.correctionDetails;
    console.log(`\nCorrection Analysis:`);
    console.log(`  Improvements: ${improvements} (raw invalid -> corrected valid)`);
    console.log(`  Degradations: ${degradations} (raw valid -> corrected invalid)`);
    console.log(`  Neutral: ${neutral} (both same validity)`);
    
    if (sampleDegradations.length > 0) {
      console.log(`\n  Sample Degradations (${sampleDegradations.length}):`);
      for (const d of sampleDegradations.slice(0, 10)) {
        console.log(`    ${d.token}: "${d.rawPinyin}" -> "${d.correctedPinyin}" [${d.sentenceId}]`);
      }
      if (sampleDegradations.length > 10) {
        console.log(`    ... and ${sampleDegradations.length - 10} more`);
      }
    }
  }

  if (summary.semanticStats) {
    console.log(`\nSemantic Evaluation:`);
    console.log(`  Correct: ${summary.semanticStats.correct}`);
    console.log(`  Acceptable: ${summary.semanticStats.acceptable}`);
    console.log(`  Incorrect: ${summary.semanticStats.incorrect}`);
    console.log(`  Score: ${(summary.semanticStats.score * 100).toFixed(1)}%`);
  }

  console.log(`\nTiming:`);
  console.log(`  Average: ${summary.timing.avgResponseMs.toFixed(0)}ms`);
  console.log(`  Min: ${summary.timing.minResponseMs.toFixed(0)}ms`);
  console.log(`  Max: ${summary.timing.maxResponseMs.toFixed(0)}ms`);
  console.log(`  Total: ${(summary.timing.totalMs / 1000).toFixed(1)}s`);

  if (summary.cost) {
    console.log(`\nTokens:`);
    console.log(`  Prompt: ${summary.cost.promptTokens}`);
    console.log(`  Completion: ${summary.cost.completionTokens}`);
    console.log(`  Total: ${summary.cost.totalTokens}`);
  }

  console.log('');
}

/**
 * Compare multiple evaluation results
 */
export function compareResults(results: EvaluationResult[]): void {
  console.log('\n' + '='.repeat(100));
  console.log('MODEL COMPARISON');
  console.log('='.repeat(100));

  // Header
  console.log(
    'Model'.padEnd(40) +
    'Raw Pinyin'.padStart(12) +
    'Corrected'.padStart(12) +
    'Semantic'.padStart(10) +
    'Avg Time'.padStart(12) +
    'Tokens'.padStart(10)
  );
  console.log('-'.repeat(100));

  // Rows
  for (const result of results) {
    const { summary } = result;
    const rawPinyinPct = `${(summary.pinyinStats.raw.accuracy * 100).toFixed(1)}%`;
    const correctedPinyinPct = `${(summary.pinyinStats.corrected.accuracy * 100).toFixed(1)}%`;
    const semanticPct = summary.semanticStats
      ? `${(summary.semanticStats.score * 100).toFixed(1)}%`
      : 'N/A';
    const avgTime = `${summary.timing.avgResponseMs.toFixed(0)}ms`;
    const tokens = summary.cost ? summary.cost.totalTokens.toString() : 'N/A';

    console.log(
      result.modelId.padEnd(40) +
      rawPinyinPct.padStart(12) +
      correctedPinyinPct.padStart(12) +
      semanticPct.padStart(10) +
      avgTime.padStart(12) +
      tokens.padStart(10)
    );
  }

  console.log('');
}
