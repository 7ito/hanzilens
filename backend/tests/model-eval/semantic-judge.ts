/**
 * Semantic judgment using Qwen3-Max as a judge model
 * 
 * Evaluates whether AI-generated contextual definitions are semantically correct.
 */

import { config } from '../../src/config/index.js';
import { lookup } from '../../src/services/dictionary.js';
import type { SemanticJudgment, SemanticRating, SegmentEvaluation } from './types.js';

const JUDGE_MODEL = 'qwen/qwen3-max';
const JUDGE_TIMEOUT_MS = 60_000;

const JUDGE_SYSTEM_PROMPT = `You are an expert Chinese language evaluator. Your task is to judge whether AI-generated contextual definitions for Chinese words are semantically correct.

For each word segment, you will receive:
- The full Chinese sentence for context
- The Chinese word (token)
- The AI's contextual definition
- Dictionary definitions from CC-CEDICT (for reference)

Rate each definition as:
- CORRECT: The definition accurately captures the contextual meaning
- ACCEPTABLE: The definition is reasonable but could be more precise or natural
- INCORRECT: The definition is wrong, misleading, or doesn't fit the context

Important considerations:
- The AI's definition should match the CONTEXTUAL meaning, not just any dictionary meaning
- Slight variations in wording are fine if the meaning is preserved
- Overly literal translations that miss idiomatic meaning should be ACCEPTABLE at best
- Completely wrong meanings should be INCORRECT

Respond with a JSON array matching the input segments order. Each element should have:
- "rating": "CORRECT" | "ACCEPTABLE" | "INCORRECT"
- "explanation": Brief explanation (1-2 sentences)

Do not include any text outside the JSON array.`;

/**
 * Build the user prompt for judging segments
 */
function buildJudgePrompt(
  sentence: string,
  segments: Array<{ token: string; aiDefinition: string; dictDefinitions: string[] }>
): string {
  const input = {
    sentence,
    segments: segments.map(s => ({
      token: s.token,
      aiDefinition: s.aiDefinition,
      dictDefinitions: s.dictDefinitions,
    })),
  };
  
  return JSON.stringify(input, null, 2);
}

/**
 * Parse the judge model's response
 */
function parseJudgeResponse(response: string): SemanticJudgment[] {
  try {
    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    
    if (!Array.isArray(parsed)) {
      throw new Error('Response is not an array');
    }
    
    return parsed.map((item: unknown, index: number) => {
      if (typeof item !== 'object' || item === null) {
        throw new Error(`Item ${index} is not an object`);
      }
      
      const obj = item as Record<string, unknown>;
      const rating = String(obj.rating || '').toUpperCase() as SemanticRating;
      
      if (!['CORRECT', 'ACCEPTABLE', 'INCORRECT'].includes(rating)) {
        throw new Error(`Invalid rating "${obj.rating}" at index ${index}`);
      }
      
      return {
        rating,
        explanation: String(obj.explanation || 'No explanation provided'),
      };
    });
  } catch (error) {
    console.error('Failed to parse judge response:', response);
    throw new Error(`Failed to parse judge response: ${error}`);
  }
}

/**
 * Call the judge model to evaluate segments
 */
async function callJudgeModel(prompt: string): Promise<string> {
  if (!config.openrouter.apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured');
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), JUDGE_TIMEOUT_MS);
  
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
        model: JUDGE_MODEL,
        messages: [
          { role: 'system', content: JUDGE_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        temperature: 0.1,  // Low temperature for consistent judgments
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Judge model error (${response.status}):`, errorBody);
      throw new Error(`Judge model request failed: ${response.status}`);
    }
    
    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
    };
    
    return data.choices[0]?.message?.content || '';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Judge model request timed out');
    }
    throw error;
  }
}

/**
 * Get dictionary definitions for a token
 */
function getDictDefinitions(token: string): string[] {
  const entries = lookup(token);
  if (entries.length === 0) {
    return ['(not in dictionary)'];
  }
  
  // Flatten all definitions from all entries
  const allDefs: string[] = [];
  for (const entry of entries) {
    allDefs.push(...entry.definitions);
  }
  
  // Deduplicate
  return [...new Set(allDefs)];
}

/**
 * Judge semantic correctness for segments in a sentence
 * 
 * @param sentence The full Chinese sentence
 * @param segments Segments to evaluate (only those with non-empty definitions)
 * @returns Array of judgments matching input order
 */
export async function judgeSegments(
  sentence: string,
  segments: Array<{ token: string; aiDefinition: string }>
): Promise<SemanticJudgment[]> {
  // Filter out segments with empty definitions (punctuation, numbers)
  const segmentsToJudge = segments.filter(s => s.aiDefinition && s.aiDefinition.trim() !== '');
  
  if (segmentsToJudge.length === 0) {
    // Return empty judgments for all segments
    return segments.map(() => ({
      rating: 'CORRECT' as SemanticRating,
      explanation: 'Empty definition (punctuation/number) - not judged',
    }));
  }
  
  // Build segments with dictionary definitions
  const segmentsWithDict = segmentsToJudge.map(s => ({
    token: s.token,
    aiDefinition: s.aiDefinition,
    dictDefinitions: getDictDefinitions(s.token),
  }));
  
  // Build prompt and call judge
  const prompt = buildJudgePrompt(sentence, segmentsWithDict);
  const response = await callJudgeModel(prompt);
  const judgments = parseJudgeResponse(response);
  
  // Verify we got the right number of judgments
  if (judgments.length !== segmentsToJudge.length) {
    console.warn(`Judge returned ${judgments.length} judgments but expected ${segmentsToJudge.length}`);
  }
  
  // Map judgments back to original segments (including empty ones)
  const result: SemanticJudgment[] = [];
  let judgmentIndex = 0;
  
  for (const segment of segments) {
    if (!segment.aiDefinition || segment.aiDefinition.trim() === '') {
      result.push({
        rating: 'CORRECT',
        explanation: 'Empty definition (punctuation/number) - not judged',
      });
    } else {
      result.push(judgments[judgmentIndex] || {
        rating: 'INCORRECT',
        explanation: 'No judgment returned for this segment',
      });
      judgmentIndex++;
    }
  }
  
  return result;
}

/**
 * Judge segments in batches to reduce API calls
 * 
 * Groups segments by sentence and judges each sentence's segments together.
 */
export async function judgeSegmentsBatched(
  sentenceResults: Array<{
    input: string;
    segmentEvaluations: SegmentEvaluation[];
  }>,
  onProgress?: (completed: number, total: number, sentence: string) => void
): Promise<void> {
  const total = sentenceResults.length;
  
  for (let i = 0; i < sentenceResults.length; i++) {
    const result = sentenceResults[i];
    if (result.segmentEvaluations.length === 0) {
      onProgress?.(i + 1, total, result.input);
      continue;
    }
    
    onProgress?.(i + 1, total, result.input);
    
    try {
      const segments = result.segmentEvaluations.map(se => ({
        token: se.token,
        aiDefinition: se.aiDefinition,
      }));
      
      const judgments = await judgeSegments(result.input, segments);
      
      // Attach judgments to evaluations
      for (let j = 0; j < result.segmentEvaluations.length; j++) {
        result.segmentEvaluations[j].semanticJudgment = judgments[j];
      }
    } catch (error) {
      console.error(`\nFailed to judge segments for "${result.input}":`, error);
      // Mark all segments as unable to judge
      for (const se of result.segmentEvaluations) {
        se.semanticJudgment = {
          rating: 'INCORRECT',
          explanation: `Judgment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        };
      }
    }
  }
}

/**
 * Calculate semantic statistics from judgments
 */
export function calculateSemanticStats(
  evaluations: SegmentEvaluation[]
): { correct: number; acceptable: number; incorrect: number; score: number } {
  let correct = 0;
  let acceptable = 0;
  let incorrect = 0;
  
  for (const e of evaluations) {
    if (!e.semanticJudgment) continue;
    
    switch (e.semanticJudgment.rating) {
      case 'CORRECT':
        correct++;
        break;
      case 'ACCEPTABLE':
        acceptable++;
        break;
      case 'INCORRECT':
        incorrect++;
        break;
    }
  }
  
  const total = correct + acceptable + incorrect;
  const score = total > 0 ? (correct + acceptable) / total : 1;
  
  return { correct, acceptable, incorrect, score };
}
