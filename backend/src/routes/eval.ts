/**
 * Evaluation routes - development only
 * 
 * These endpoints are for model evaluation and testing.
 * They bypass rate limiting and allow model overrides.
 * 
 * Features:
 * - Two-stage pipeline evaluation (Segmentation + Alignment)
 * - Model override via request body
 * - No rate limiting
 * - Returns token usage for both stages
 * - Returns both raw AI pinyin and corrected pinyin for comparison
 * - Returns alignment validation metrics
 * - Uses the full production pinyin-pro correction pipeline
 */

import { Router, Request, Response } from 'express';
import { 
  segmentationNonStreaming, 
  getTranslationAlignment,
  TokenUsage 
} from '../services/ai.js';
import { getSegmentationModel, getAlignmentModel } from '../config/index.js';
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
  model?: string;     // Optional segmentation model override (OpenRouter slug)
  alignmentModel?: string;  // Optional alignment model override
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
 * Token usage for two-stage pipeline
 */
interface TwoStageUsage {
  segmentation: TokenUsage;
  alignment: TokenUsage | null;
  total: TokenUsage;
}

/**
 * Alignment validation result
 */
interface AlignmentValidation {
  isValid: boolean;
  reconstructionMatches: boolean;
  segmentIdsValid: boolean;
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
 * Validate translation alignment
 * 
 * @param translation - Original translation string
 * @param segments - Array of segments with IDs
 * @param translationParts - Alignment result from Stage 2
 * @returns Validation result
 */
function validateAlignment(
  translation: string,
  segments: Array<{ id: number }>,
  translationParts: Array<{ text: string; segmentIds: number[] }>
): AlignmentValidation {
  // Check reconstruction matches original translation
  const reconstructed = translationParts.map(p => p.text).join('');
  const reconstructionMatches = reconstructed === translation;
  
  // Check all segment IDs are valid
  const validIds = new Set(segments.map(s => s.id));
  const segmentIdsValid = translationParts.every(p => 
    p.segmentIds.every(id => validIds.has(id))
  );
  
  return {
    isValid: reconstructionMatches && segmentIdsValid,
    reconstructionMatches,
    segmentIdsValid,
  };
}

/**
 * POST /eval/parse
 * 
 * Parse Chinese text using two-stage pipeline with optional model overrides.
 * Returns non-streaming JSON with token usage and evaluation metrics.
 * 
 * This endpoint is for model evaluation only and:
 * - Bypasses rate limiting
 * - Uses two-stage pipeline (Segmentation → Alignment)
 * - Allows specifying models via the request body
 * - Returns both raw AI pinyin and corrected pinyin
 * - Returns token usage statistics for both stages
 * - Returns alignment validation metrics
 * 
 * Request body:
 * {
 *   "sentence": "Chinese text to parse",
 *   "model": "qwen/qwen3-30b-a3b-instruct", // optional segmentation model
 *   "alignmentModel": "xiaomi/mimo-v2-flashfree", // optional alignment model
 *   "provider": "fireworks" // optional - OpenRouter provider slug
 * }
 * 
 * Response:
 * {
 *   "segmentationModel": "qwen/qwen3-30b-a3b-instruct",
 *   "alignmentModel": "xiaomi/mimo-v2-flashfree",
 *   "provider": "fireworks" | null,
 *   "result": {
 *     "translation": "...",
 *     "segments": [...],  // With rawPinyin and correctedPinyin
 *     "translationParts": [...]
 *   },
 *   "alignmentValidation": { "isValid": true, "reconstructionMatches": true, "segmentIdsValid": true },
 *   "usage": {
 *     "segmentation": { "prompt": 100, "completion": 200, "total": 300 },
 *     "alignment": { "prompt": 50, "completion": 100, "total": 150 },
 *     "total": { "prompt": 150, "completion": 300, "total": 450 }
 *   }
 * }
 */
router.post('/parse', async (req: Request, res: Response) => {
  const { 
    sentence, 
    model: modelOverride, 
    alignmentModel: alignmentModelOverride,
    provider: providerOverride 
  } = req.body as EvalParseRequest;

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
    // Stage 1: Segmentation
    const segResult = await segmentationNonStreaming(
      trimmedSentence, 
      modelOverride, 
      providerOverride
    );

    // Apply pinyin correction (same as production)
    const correctedSegments = applyPinyinCorrection(trimmedSentence, segResult.result.segments);

    // Stage 2: Alignment
    const alignResult = await getTranslationAlignment(
      segResult.result.translation,
      correctedSegments.map(s => ({ id: s.id, token: s.token })),
      alignmentModelOverride,
      providerOverride
    );

    // Validate alignment if we got a result
    const alignmentValidation = alignResult 
      ? validateAlignment(
          segResult.result.translation,
          correctedSegments,
          alignResult.translationParts
        )
      : null;

    // Calculate total usage
    const totalUsage: TwoStageUsage = {
      segmentation: segResult.usage,
      alignment: alignResult?.usage || null,
      total: {
        prompt: segResult.usage.prompt + (alignResult?.usage.prompt || 0),
        completion: segResult.usage.completion + (alignResult?.usage.completion || 0),
        total: segResult.usage.total + (alignResult?.usage.total || 0),
      },
    };

    res.json({
      segmentationModel: segResult.model,
      alignmentModel: alignResult?.model || getAlignmentModel(),
      provider: providerOverride || null,
      result: {
        translation: segResult.result.translation,
        segments: correctedSegments,
        translationParts: alignResult?.translationParts || [],
      },
      alignmentValidation,
      usage: totalUsage,
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
