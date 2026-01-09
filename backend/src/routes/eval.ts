/**
 * Evaluation routes - development only
 * 
 * These endpoints are for model evaluation and testing.
 * They bypass rate limiting and allow model overrides.
 * 
 * Features:
 * - Model override via request body
 * - No rate limiting
 * - Returns token usage
 * - Returns both raw AI pinyin and corrected pinyin for comparison
 * - Uses the full production pinyin-pro correction pipeline
 */

import { Router, Request, Response } from 'express';
import { parseNonStreaming } from '../services/ai.js';
import { 
  buildPinyinMap, 
  getPinyinFromMap, 
  findTokenPosition 
} from '../services/pinyinCorrection.js';

const router = Router();

/**
 * Request body for /eval/parse
 */
interface EvalParseRequest {
  sentence: string;
  model?: string;     // Optional model override (OpenRouter slug)
  provider?: string;  // Optional provider slug (e.g., 'fireworks', 'together', 'deepinfra')
}

/**
 * Segment with both raw and corrected pinyin
 */
interface EvalSegment {
  id: number;
  token: string;
  rawPinyin: string;       // Original pinyin from AI model
  correctedPinyin: string; // Pinyin after pinyin-pro correction
  pinyin: string;          // Final pinyin (same as correctedPinyin, for compatibility)
  definition: string;
}

/**
 * Apply pinyin correction to segments using pinyin-pro
 * Same logic as production pipeline in parse.ts
 * 
 * @param sentence - Original sentence for context-aware correction
 * @param segments - Segments from AI model
 * @returns Segments with both raw and corrected pinyin
 */
function applyPinyinCorrection(
  sentence: string,
  segments: Array<{ id: number; token: string; pinyin: string; definition: string }>
): EvalSegment[] {
  // Build pinyin map for the full sentence (context-aware)
  const pinyinMap = buildPinyinMap(sentence);
  let position = 0;

  return segments.map(segment => {
    const rawPinyin = segment.pinyin;
    let correctedPinyin = rawPinyin;

    // Find token position in sentence and get corrected pinyin
    const tokenPos = findTokenPosition(pinyinMap.sentence, segment.token, position);
    if (tokenPos >= 0) {
      const newPinyin = getPinyinFromMap(pinyinMap, segment.token, tokenPos);
      if (newPinyin) {
        correctedPinyin = newPinyin;
      }
      position = tokenPos + segment.token.length;
    }

    return {
      id: segment.id,
      token: segment.token,
      rawPinyin,
      correctedPinyin,
      pinyin: correctedPinyin,  // For compatibility with existing code
      definition: segment.definition,
    };
  });
}

/**
 * POST /eval/parse
 * 
 * Parse Chinese text with optional model override.
 * Returns non-streaming JSON with token usage and pinyin comparison.
 * 
 * This endpoint is for model evaluation only and:
 * - Bypasses rate limiting
 * - Allows specifying any model via the request body
 * - Returns both raw AI pinyin and corrected pinyin
 * - Returns token usage statistics
 * 
 * Request body:
 * {
 *   "sentence": "Chinese text to parse",
 *   "model": "qwen/qwen-2.5-72b-instruct", // optional
 *   "provider": "fireworks" // optional - OpenRouter provider slug
 * }
 * 
 * Response:
 * {
 *   "model": "qwen/qwen-2.5-72b-instruct",
 *   "provider": "fireworks" | null,
 *   "result": {
 *     "translation": "...",
 *     "segments": [...],  // With rawPinyin and correctedPinyin
 *     "translationParts": [...]
 *   },
 *   "usage": { "prompt": 123, "completion": 456, "total": 579 }
 * }
 */
router.post('/parse', async (req: Request, res: Response) => {
  const { sentence, model: modelOverride, provider: providerOverride } = req.body as EvalParseRequest;

  // Validation
  if (!sentence || typeof sentence !== 'string') {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Missing or invalid "sentence" in request body',
    });
    return;
  }

  const trimmedSentence = sentence.trim();
  if (trimmedSentence === '') {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Sentence cannot be empty',
    });
    return;
  }

  try {
    // Get AI parse result (non-streaming)
    const { result, model, usage } = await parseNonStreaming(trimmedSentence, modelOverride, providerOverride);

    // Apply pinyin correction (same as production)
    const correctedSegments = applyPinyinCorrection(trimmedSentence, result.segments);

    res.json({
      model,
      provider: providerOverride || null,
      result: {
        translation: result.translation,
        segments: correctedSegments,
        translationParts: result.translationParts,
      },
      usage,
    });
  } catch (error) {
    console.error('Eval parse error:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Parse failed',
    });
  }
});

export default router;
