#!/usr/bin/env npx tsx
/**
 * Pipeline Timing Benchmark
 * 
 * Compares the performance of:
 * 1. Monolithic approach: Single model call with full prompt (translation + segments + translationParts)
 * 2. Two-stage pipeline: Segmentation model + Alignment model
 * 
 * Usage:
 *   npm run benchmark:timing
 *   npm run benchmark:timing -- --count 10
 */

import { parseArgs } from 'util';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { 
  parseNonStreaming, 
  segmentationNonStreaming, 
  getTranslationAlignment 
} from '../../src/services/ai.js';
import { getSegmentationModel, getAlignmentModel } from '../../src/config/index.js';
import type {
  SentenceTimingResult,
  TimingBenchmarkResult,
  TimingBenchmarkSummary,
  TimingBenchmarkOptions,
  TimingPercentiles,
  TokenUsage,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = resolve(__dirname, 'results');

// ============================================================================
// BENCHMARK SENTENCES (from zh.wikipedia.org)
// ============================================================================

/**
 * Sample sentences from Chinese Wikipedia for benchmarking.
 * Selected to cover various lengths and complexity levels.
 */
const BENCHMARK_SENTENCES = [
  // Short - from zh.wikipedia.org/wiki/中国
  '中国是世界上人口最多的国家。',
  
  // Medium - from zh.wikipedia.org/wiki/北京
  '北京是中华人民共和国的首都，也是中国的政治、文化中心。',
  
  // Medium-long - from zh.wikipedia.org/wiki/长城
  '长城是中国古代的军事防御工程，被联合国教科文组织列为世界文化遗产。',
  
  // Long - from zh.wikipedia.org/wiki/故宫
  '故宫位于北京市中心，是明清两代的皇家宫殿，现为故宫博物院。',
  
  // Complex - from zh.wikipedia.org/wiki/人工智能
  '人工智能是计算机科学的一个分支，致力于研究和开发能够模拟人类智能的系统。',
];

// ============================================================================
// TIMING UTILITIES
// ============================================================================

/**
 * Calculate percentile statistics from an array of numbers
 */
function calculatePercentiles(values: number[]): TimingPercentiles {
  if (values.length === 0) {
    return { avg: 0, min: 0, max: 0, p50: 0, p95: 0 };
  }
  
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  
  return {
    avg: Math.round(sum / sorted.length),
    min: Math.round(sorted[0]),
    max: Math.round(sorted[sorted.length - 1]),
    p50: Math.round(sorted[Math.floor(sorted.length * 0.5)]),
    p95: Math.round(sorted[Math.floor(sorted.length * 0.95)]),
  };
}

/**
 * Calculate average token usage
 */
function averageTokens(usages: TokenUsage[]): TokenUsage {
  if (usages.length === 0) {
    return { prompt: 0, completion: 0, total: 0 };
  }
  
  const sum = usages.reduce(
    (acc, u) => ({
      prompt: acc.prompt + u.prompt,
      completion: acc.completion + u.completion,
      total: acc.total + u.total,
    }),
    { prompt: 0, completion: 0, total: 0 }
  );
  
  return {
    prompt: Math.round(sum.prompt / usages.length),
    completion: Math.round(sum.completion / usages.length),
    total: Math.round(sum.total / usages.length),
  };
}

// ============================================================================
// BENCHMARK FUNCTIONS
// ============================================================================

/**
 * Run monolithic approach for a single sentence
 */
async function benchmarkMonolithic(
  sentence: string,
  model: string
): Promise<{ totalMs: number; tokens: TokenUsage; success: boolean; error?: string }> {
  const start = performance.now();
  
  try {
    const result = await parseNonStreaming(sentence, model);
    const totalMs = performance.now() - start;
    
    return {
      totalMs,
      tokens: result.usage,
      success: true,
    };
  } catch (error) {
    const totalMs = performance.now() - start;
    return {
      totalMs,
      tokens: { prompt: 0, completion: 0, total: 0 },
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run two-stage pipeline for a single sentence
 */
async function benchmarkTwoStage(
  sentence: string,
  segmentationModel: string,
  alignmentModel: string
): Promise<{
  segmentationMs: number;
  alignmentMs: number;
  totalMs: number;
  segmentationTokens: TokenUsage;
  alignmentTokens: TokenUsage | null;
  success: boolean;
  error?: string;
}> {
  const totalStart = performance.now();
  
  try {
    // Stage 1: Segmentation
    const segStart = performance.now();
    const segResult = await segmentationNonStreaming(sentence, segmentationModel);
    const segmentationMs = performance.now() - segStart;
    
    // Stage 2: Alignment
    const alignStart = performance.now();
    const alignResult = await getTranslationAlignment(
      segResult.result.translation,
      segResult.result.segments.map(s => ({ id: s.id, token: s.token })),
      alignmentModel
    );
    const alignmentMs = performance.now() - alignStart;
    
    const totalMs = performance.now() - totalStart;
    
    return {
      segmentationMs,
      alignmentMs,
      totalMs,
      segmentationTokens: segResult.usage,
      alignmentTokens: alignResult?.usage || null,
      success: true,
    };
  } catch (error) {
    const totalMs = performance.now() - totalStart;
    return {
      segmentationMs: 0,
      alignmentMs: 0,
      totalMs,
      segmentationTokens: { prompt: 0, completion: 0, total: 0 },
      alignmentTokens: null,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Run the full benchmark
 */
async function runBenchmark(options: TimingBenchmarkOptions): Promise<TimingBenchmarkResult> {
  const {
    monolithicModel,
    segmentationModel,
    alignmentModel,
    sentences,
    warmupCount = 1,
    onProgress,
  } = options;
  
  const results: SentenceTimingResult[] = [];
  
  // Warmup phase
  if (warmupCount > 0) {
    onProgress?.('warmup', 0, warmupCount);
    const warmupSentence = sentences[0];
    
    for (let i = 0; i < warmupCount; i++) {
      onProgress?.('warmup', i + 1, warmupCount);
      
      // Warmup monolithic
      await benchmarkMonolithic(warmupSentence, monolithicModel);
      
      // Small delay
      await new Promise(r => setTimeout(r, 500));
      
      // Warmup two-stage
      await benchmarkTwoStage(warmupSentence, segmentationModel, alignmentModel);
      
      // Small delay before next warmup
      if (i < warmupCount - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
  
  // Benchmark phase
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    onProgress?.('benchmark', i + 1, sentences.length);
    
    // Run monolithic
    const monolithicResult = await benchmarkMonolithic(sentence, monolithicModel);
    
    // Small delay between approaches
    await new Promise(r => setTimeout(r, 500));
    
    // Run two-stage
    const twoStageResult = await benchmarkTwoStage(sentence, segmentationModel, alignmentModel);
    
    results.push({
      sentence,
      monolithic: monolithicResult,
      twoStage: twoStageResult,
    });
    
    // Small delay before next sentence
    if (i < sentences.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Calculate summary
  const summary = calculateSummary(results, warmupCount);
  
  return {
    timestamp: new Date().toISOString(),
    models: {
      monolithic: monolithicModel,
      segmentation: segmentationModel,
      alignment: alignmentModel,
    },
    sentences: results,
    summary,
  };
}

/**
 * Calculate summary statistics from results
 */
function calculateSummary(
  results: SentenceTimingResult[],
  warmupCount: number
): TimingBenchmarkSummary {
  // Filter successful results for timing stats
  const successfulMonolithic = results.filter(r => r.monolithic.success);
  const successfulTwoStage = results.filter(r => r.twoStage.success);
  
  // Monolithic timing
  const monolithicTimes = successfulMonolithic.map(r => r.monolithic.totalMs);
  const monolithicTiming = calculatePercentiles(monolithicTimes);
  const monolithicTokens = successfulMonolithic.map(r => r.monolithic.tokens);
  
  // Two-stage timing
  const segmentationTimes = successfulTwoStage.map(r => r.twoStage.segmentationMs);
  const alignmentTimes = successfulTwoStage.map(r => r.twoStage.alignmentMs);
  const twoStageTotalTimes = successfulTwoStage.map(r => r.twoStage.totalMs);
  
  const segmentationTiming = calculatePercentiles(segmentationTimes);
  const alignmentTiming = calculatePercentiles(alignmentTimes);
  const totalTiming = calculatePercentiles(twoStageTotalTimes);
  
  const segmentationTokens = successfulTwoStage.map(r => r.twoStage.segmentationTokens);
  const alignmentTokens = successfulTwoStage
    .filter(r => r.twoStage.alignmentTokens)
    .map(r => r.twoStage.alignmentTokens!);
  
  // Comparison
  const speedupFactor = totalTiming.avg > 0 
    ? monolithicTiming.avg / totalTiming.avg 
    : 0;
  
  const avgTwoStageTotal = totalTiming.avg || 1;
  const segmentationPct = (segmentationTiming.avg / avgTwoStageTotal) * 100;
  const alignmentPct = (alignmentTiming.avg / avgTwoStageTotal) * 100;
  
  return {
    sentenceCount: results.length,
    warmupCount,
    
    monolithic: {
      timing: monolithicTiming,
      successRate: results.length > 0 ? successfulMonolithic.length / results.length : 0,
      avgTokens: averageTokens(monolithicTokens),
    },
    
    twoStage: {
      segmentationTiming,
      alignmentTiming,
      totalTiming,
      successRate: results.length > 0 ? successfulTwoStage.length / results.length : 0,
      avgSegmentationTokens: averageTokens(segmentationTokens),
      avgAlignmentTokens: alignmentTokens.length > 0 ? averageTokens(alignmentTokens) : null,
    },
    
    comparison: {
      speedupFactor: Math.round(speedupFactor * 100) / 100,
      segmentationPct: Math.round(segmentationPct),
      alignmentPct: Math.round(alignmentPct),
    },
  };
}

// ============================================================================
// OUTPUT FORMATTING
// ============================================================================

/**
 * Print benchmark results to console
 */
function printResults(result: TimingBenchmarkResult): void {
  const { models, summary } = result;
  
  console.log('\n' + '='.repeat(80));
  console.log('PIPELINE TIMING BENCHMARK');
  console.log('='.repeat(80));
  
  console.log('\nModels:');
  console.log(`  Monolithic:    ${models.monolithic}`);
  console.log(`  Segmentation:  ${models.segmentation}`);
  console.log(`  Alignment:     ${models.alignment}`);
  
  console.log(`\nSentences: ${summary.sentenceCount} (+ ${summary.warmupCount} warmup)`);
  
  console.log('\n' + '-'.repeat(80));
  console.log('TIMING RESULTS (ms)');
  console.log('-'.repeat(80));
  
  // Header
  console.log(
    'Approach'.padEnd(20) +
    'Avg'.padStart(10) +
    'P50'.padStart(10) +
    'P95'.padStart(10) +
    'Min'.padStart(10) +
    'Max'.padStart(10)
  );
  console.log('-'.repeat(70));
  
  // Monolithic
  const m = summary.monolithic.timing;
  console.log(
    'Monolithic'.padEnd(20) +
    m.avg.toString().padStart(10) +
    m.p50.toString().padStart(10) +
    m.p95.toString().padStart(10) +
    m.min.toString().padStart(10) +
    m.max.toString().padStart(10)
  );
  
  // Two-stage total
  const t = summary.twoStage.totalTiming;
  console.log(
    'Two-Stage (total)'.padEnd(20) +
    t.avg.toString().padStart(10) +
    t.p50.toString().padStart(10) +
    t.p95.toString().padStart(10) +
    t.min.toString().padStart(10) +
    t.max.toString().padStart(10)
  );
  
  // Segmentation
  const s = summary.twoStage.segmentationTiming;
  console.log(
    '  ├─ Segmentation'.padEnd(20) +
    s.avg.toString().padStart(10) +
    s.p50.toString().padStart(10) +
    s.p95.toString().padStart(10) +
    s.min.toString().padStart(10) +
    s.max.toString().padStart(10)
  );
  
  // Alignment
  const a = summary.twoStage.alignmentTiming;
  console.log(
    '  └─ Alignment'.padEnd(20) +
    a.avg.toString().padStart(10) +
    a.p50.toString().padStart(10) +
    a.p95.toString().padStart(10) +
    a.min.toString().padStart(10) +
    a.max.toString().padStart(10)
  );
  
  // Comparison
  console.log('\n' + '-'.repeat(80));
  console.log('COMPARISON');
  console.log('-'.repeat(80));
  
  const comp = summary.comparison;
  if (comp.speedupFactor >= 1) {
    console.log(`Two-stage is ${comp.speedupFactor.toFixed(2)}x faster than monolithic (avg)`);
  } else {
    console.log(`Monolithic is ${(1 / comp.speedupFactor).toFixed(2)}x faster than two-stage (avg)`);
  }
  console.log(`Segmentation: ${comp.segmentationPct}% of two-stage time`);
  console.log(`Alignment: ${comp.alignmentPct}% of two-stage time`);
  
  // Token usage
  console.log('\n' + '-'.repeat(80));
  console.log('TOKEN USAGE (avg per sentence)');
  console.log('-'.repeat(80));
  
  console.log(
    'Approach'.padEnd(20) +
    'Prompt'.padStart(10) +
    'Completion'.padStart(12) +
    'Total'.padStart(10)
  );
  console.log('-'.repeat(52));
  
  const mt = summary.monolithic.avgTokens;
  console.log(
    'Monolithic'.padEnd(20) +
    mt.prompt.toString().padStart(10) +
    mt.completion.toString().padStart(12) +
    mt.total.toString().padStart(10)
  );
  
  const st = summary.twoStage.avgSegmentationTokens;
  const at = summary.twoStage.avgAlignmentTokens;
  const twoStageTotal = {
    prompt: st.prompt + (at?.prompt || 0),
    completion: st.completion + (at?.completion || 0),
    total: st.total + (at?.total || 0),
  };
  
  console.log(
    'Two-Stage (total)'.padEnd(20) +
    twoStageTotal.prompt.toString().padStart(10) +
    twoStageTotal.completion.toString().padStart(12) +
    twoStageTotal.total.toString().padStart(10)
  );
  
  console.log(
    '  ├─ Segmentation'.padEnd(20) +
    st.prompt.toString().padStart(10) +
    st.completion.toString().padStart(12) +
    st.total.toString().padStart(10)
  );
  
  if (at) {
    console.log(
      '  └─ Alignment'.padEnd(20) +
      at.prompt.toString().padStart(10) +
      at.completion.toString().padStart(12) +
      at.total.toString().padStart(10)
    );
  }
  
  // Success rates
  console.log('\n' + '-'.repeat(80));
  console.log('SUCCESS RATES');
  console.log('-'.repeat(80));
  console.log(`Monolithic: ${(summary.monolithic.successRate * 100).toFixed(0)}%`);
  console.log(`Two-Stage: ${(summary.twoStage.successRate * 100).toFixed(0)}%`);
  
  // Per-sentence details
  console.log('\n' + '-'.repeat(80));
  console.log('PER-SENTENCE DETAILS (ms)');
  console.log('-'.repeat(80));
  
  console.log(
    '#'.padEnd(3) +
    'Monolithic'.padStart(12) +
    'Two-Stage'.padStart(12) +
    'Segment'.padStart(10) +
    'Align'.padStart(10) +
    '  Sentence'
  );
  console.log('-'.repeat(80));
  
  result.sentences.forEach((r, i) => {
    const mono = r.monolithic.success ? Math.round(r.monolithic.totalMs).toString() : 'ERR';
    const total = r.twoStage.success ? Math.round(r.twoStage.totalMs).toString() : 'ERR';
    const seg = r.twoStage.success ? Math.round(r.twoStage.segmentationMs).toString() : '-';
    const align = r.twoStage.success ? Math.round(r.twoStage.alignmentMs).toString() : '-';
    const sentence = r.sentence.length > 35 ? r.sentence.slice(0, 35) + '...' : r.sentence;
    
    console.log(
      (i + 1).toString().padEnd(3) +
      mono.padStart(12) +
      total.padStart(12) +
      seg.padStart(10) +
      align.padStart(10) +
      '  ' + sentence
    );
  });
  
  console.log('');
}

// ============================================================================
// CLI
// ============================================================================

async function ensureResultsDir(): Promise<void> {
  if (!existsSync(RESULTS_DIR)) {
    await mkdir(RESULTS_DIR, { recursive: true });
  }
}

function generateOutputPath(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(RESULTS_DIR, `timing-${timestamp}.json`);
}

// Parse CLI arguments
const { values } = parseArgs({
  options: {
    count: {
      type: 'string',
      short: 'c',
      default: '5',
      description: 'Number of sentences to benchmark',
    },
    'monolithic-model': {
      type: 'string',
      short: 'm',
      description: 'Model for monolithic approach',
    },
    'segmentation-model': {
      type: 'string',
      short: 's',
      description: 'Model for segmentation stage',
    },
    'alignment-model': {
      type: 'string',
      short: 'a',
      description: 'Model for alignment stage',
    },
    warmup: {
      type: 'string',
      short: 'w',
      default: '1',
      description: 'Number of warmup requests',
    },
    output: {
      type: 'string',
      short: 'o',
      description: 'Output file path',
    },
    help: {
      type: 'boolean',
      short: 'h',
      default: false,
    },
  },
  strict: true,
  allowPositionals: false,
});

function showHelp(): void {
  console.log(`
Pipeline Timing Benchmark

Compares monolithic vs two-stage pipeline performance.

Usage:
  npm run benchmark:timing -- [options]

Options:
  -c, --count <n>              Number of sentences to benchmark (default: 5)
  -m, --monolithic-model <id>  Model for monolithic approach
  -s, --segmentation-model <id> Model for segmentation stage
  -a, --alignment-model <id>   Model for alignment stage
  -w, --warmup <n>             Number of warmup requests (default: 1)
  -o, --output <path>          Output file path
  -h, --help                   Show this help

Examples:
  npm run benchmark:timing
  npm run benchmark:timing -- --count 10
  npm run benchmark:timing -- -m qwen/qwen3-30b-a3b-instruct-2507 -s qwen/qwen3-30b-a3b-instruct-2507 -a xiaomi/mimo-v2-flash:free
`);
}

async function main(): Promise<void> {
  if (values.help) {
    showHelp();
    process.exit(0);
  }
  
  // Get models (use configured defaults if not specified)
  const monolithicModel = values['monolithic-model'] || getSegmentationModel();
  const segmentationModel = values['segmentation-model'] || getSegmentationModel();
  const alignmentModel = values['alignment-model'] || getAlignmentModel();
  
  if (!monolithicModel || !segmentationModel || !alignmentModel) {
    console.error('Error: Models not configured. Set environment variables or use CLI options.');
    process.exit(1);
  }
  
  const count = parseInt(values.count || '5', 10);
  const warmupCount = parseInt(values.warmup || '1', 10);
  const sentences = BENCHMARK_SENTENCES.slice(0, count);
  
  if (sentences.length < count) {
    console.warn(`Warning: Only ${sentences.length} benchmark sentences available`);
  }
  
  console.log('Starting timing benchmark...');
  
  const result = await runBenchmark({
    monolithicModel,
    segmentationModel,
    alignmentModel,
    sentences,
    warmupCount,
    onProgress: (phase, current, total) => {
      const phaseName = phase === 'warmup' ? 'Warmup' : 'Benchmark';
      process.stdout.write(`\r  ${phaseName}: ${current}/${total}`.padEnd(40));
    },
  });
  
  // Clear progress line
  process.stdout.write('\r' + ' '.repeat(40) + '\r');
  
  // Print results
  printResults(result);
  
  // Save results
  await ensureResultsDir();
  const outputPath = values.output || generateOutputPath();
  await writeFile(outputPath, JSON.stringify(result, null, 2));
  console.log(`Results saved to: ${outputPath}`);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
