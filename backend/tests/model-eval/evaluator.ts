/**
 * Core evaluation orchestration
 * 
 * Coordinates parsing, pinyin validation, and semantic judging.
 */

import { config } from '../../src/config/index.js';
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
  ParseResponse,
  TokenUsage,
  PinyinStats,
} from './types.js';

// Use the same system prompt as the main AI service
const SYSTEM_PROMPT = `You are a Chinese language segmentation assistant. Your task is to break down Chinese sentences into individual words (词语) and provide linguistic information for each, along with alignment to the English translation.

## Input
You will receive a Chinese sentence.

## Output
Return a JSON object with these fields IN THIS EXACT ORDER:
1. "translation": A natural English translation of the full sentence
2. "segments": An array of word segments with unique IDs
3. "translationParts": An array of translation fragments with segment references

IMPORTANT: Output segments BEFORE translationParts to enable streaming display.

## Segment Format
Each segment must have:
- "id": A unique integer starting from 0, incrementing for each segment
- "token": The original Chinese text
- "pinyin": Pronunciation with tone numbers (1-5), spaces between syllables
- "definition": The contextual meaning in this sentence (concise, 1-5 words)

## Translation Parts Format
Break the English translation into parts that map back to Chinese segments:
- "text": The English text fragment (word, phrase, or punctuation)
- "segmentIds": Array of segment IDs this text corresponds to

Rules for translationParts:
- A part can reference multiple segments (e.g., "11th" references both 第 and 11)
- A part can reference no segments (segmentIds: []) for English grammar words like "the", "of", "a"
- Multiple parts can reference the same segment if needed
- Spaces should be separate parts with empty segmentIds: {"text": " ", "segmentIds": []}
- Concatenating all parts' text must exactly equal the translation string
- Keep multi-word English phrases together when they map to one Chinese segment

## Rules

### Pinyin Format
- Use tone numbers: ni3 hao3, bu4 shi4, ma5
- Use u: for ü: nu:3, lü4
- Separate syllables with spaces: zhong1 guo2 (not zhong1guo2)
- No hyphens or special characters

### Segmentation
- Segment into natural word units (词语), not individual characters
- Keep grammatical particles attached appropriately: 了, 的, 吗, 吧
- Proper nouns and titles stay as one segment (e.g., 《异度觉醒》)

### Special Cases
- Punctuation: {"id": N, "token": "。", "pinyin": "", "definition": ""}
- Numbers: {"id": N, "token": "2024", "pinyin": "", "definition": ""}
- English: {"id": N, "token": "NBA", "pinyin": "", "definition": ""}`;

const AI_TIMEOUT_MS = 90_000;

/**
 * Parse a sentence using a specific model via OpenRouter
 * 
 * This is a non-streaming version that collects the full response.
 */
async function parseWithModel(
  modelId: string,
  sentence: string
): Promise<{ result: ParseResponse; tokensUsed?: TokenUsage }> {
  if (!config.openrouter.apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  
  try {
    const response = await fetch(`${config.openrouter.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openrouter.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hanzilens.com',
        'X-Title': 'HanziLens Model Eval',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: sentence },
        ],
        response_format: { type: 'json_object' },
        // Non-streaming for evaluation
        stream: false,
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Model ${modelId} error (${response.status}):`, errorBody);
      throw new Error(`Model request failed: ${response.status}`);
    }
    
    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from model');
    }
    
    // Parse the JSON response
    const parsed = JSON.parse(content) as ParseResponse;
    
    // Validate basic structure
    if (!parsed.segments || !Array.isArray(parsed.segments)) {
      throw new Error('Invalid response: missing segments array');
    }
    
    // Extract token usage if available
    const tokensUsed = data.usage ? {
      prompt: data.usage.prompt_tokens,
      completion: data.usage.completion_tokens,
      total: data.usage.total_tokens,
    } : undefined;
    
    return { result: parsed, tokensUsed };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Model request timed out');
    }
    throw error;
  }
}

/**
 * Evaluate a single sentence
 */
async function evaluateSentence(
  modelId: string,
  sentence: TestSentence
): Promise<SentenceResult> {
  const startTime = performance.now();
  
  let parseResult: ParseResponse | undefined;
  let parseError: string | undefined;
  let tokensUsed: TokenUsage | undefined;
  
  try {
    const result = await parseWithModel(modelId, sentence.text);
    parseResult = result.result;
    tokensUsed = result.tokensUsed;
  } catch (error) {
    parseError = error instanceof Error ? error.message : 'Unknown error';
  }
  
  const responseTimeMs = performance.now() - startTime;
  
  // Build segment evaluations
  const segmentEvaluations: SegmentEvaluation[] = [];
  
  if (parseResult) {
    for (const segment of parseResult.segments) {
      const pinyinValidation = validateSegmentPinyin(segment.token, segment.pinyin);
      
      segmentEvaluations.push({
        segmentId: segment.id,
        token: segment.token,
        aiPinyin: segment.pinyin,
        aiDefinition: segment.definition,
        pinyinValidation,
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
    parseResult,
    segmentEvaluations,
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
  
  // Pinyin stats
  const pinyinValidations = allEvaluations.map(e => e.pinyinValidation);
  const pinyinStats = calculatePinyinStats(pinyinValidations);
  
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
      // Note: actual cost calculation would require model pricing data
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
  const { modelId, sentences, enableSemanticJudging, onProgress } = options;
  
  // Ensure database is initialized
  getDatabase();
  
  console.log(`\nEvaluating model: ${modelId}`);
  console.log(`Sentences: ${sentences.length}`);
  console.log(`Semantic judging: ${enableSemanticJudging ? 'enabled' : 'disabled'}`);
  console.log('');
  
  // Evaluate each sentence
  const results: SentenceResult[] = [];
  
  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    
    onProgress?.(i + 1, sentences.length, sentence.text);
    
    const result = await evaluateSentence(modelId, sentence);
    results.push(result);
    
    // Small delay between requests to avoid rate limiting
    if (i < sentences.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
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
  
  console.log(`\nPinyin Accuracy:`);
  console.log(`  Valid: ${summary.pinyinStats.valid}`);
  console.log(`  Invalid: ${summary.pinyinStats.invalid}`);
  console.log(`  Not in dictionary: ${summary.pinyinStats.notInDictionary}`);
  console.log(`  Empty (punct/num): ${summary.pinyinStats.emptyPinyin}`);
  console.log(`  Accuracy: ${(summary.pinyinStats.accuracy * 100).toFixed(1)}%`);
  
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
  console.log('\n' + '='.repeat(80));
  console.log('MODEL COMPARISON');
  console.log('='.repeat(80));
  
  // Header
  console.log(
    'Model'.padEnd(40) +
    'Pinyin'.padStart(10) +
    'Semantic'.padStart(10) +
    'Avg Time'.padStart(12) +
    'Tokens'.padStart(10)
  );
  console.log('-'.repeat(80));
  
  // Rows
  for (const result of results) {
    const { summary } = result;
    const pinyinPct = `${(summary.pinyinStats.accuracy * 100).toFixed(1)}%`;
    const semanticPct = summary.semanticStats 
      ? `${(summary.semanticStats.score * 100).toFixed(1)}%`
      : 'N/A';
    const avgTime = `${summary.timing.avgResponseMs.toFixed(0)}ms`;
    const tokens = summary.cost ? summary.cost.totalTokens.toString() : 'N/A';
    
    console.log(
      result.modelId.padEnd(40) +
      pinyinPct.padStart(10) +
      semanticPct.padStart(10) +
      avgTime.padStart(12) +
      tokens.padStart(10)
    );
  }
  
  console.log('');
}
