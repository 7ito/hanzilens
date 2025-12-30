import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

// Regex to match Chinese characters (CJK Unified Ideographs)
const CHINESE_CHAR_REGEX = /[\u4e00-\u9fff]/g;

/**
 * Count Chinese characters in a string
 */
function countChineseChars(text: string): number {
  const matches = text.match(CHINESE_CHAR_REGEX);
  return matches ? matches.length : 0;
}

/**
 * Calculate the ratio of Chinese characters in a string
 */
function getChineseRatio(text: string): number {
  if (text.length === 0) return 0;
  return countChineseChars(text) / text.length;
}

/**
 * Express request with validated text attached
 */
export interface ValidatedRequest extends Request {
  validatedText?: string;
}

/**
 * Middleware to validate Chinese text input for the /parse endpoint.
 * 
 * Validates:
 * - Request body has a `sentence` field
 * - Sentence is not empty
 * - Sentence length is within limit
 * - At least 25% of characters are Chinese
 * 
 * On success, attaches `validatedText` to the request object.
 */
export function validateChineseInput(
  req: ValidatedRequest,
  res: Response,
  next: NextFunction
): void {
  const { sentence } = req.body;

  // Check for presence
  if (!sentence || typeof sentence !== 'string') {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Missing or invalid "sentence" in request body',
    });
    return;
  }

  const trimmed = sentence.trim();

  // Check for empty
  if (trimmed === '') {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Sentence cannot be empty',
    });
    return;
  }

  // Check length limit
  if (trimmed.length > config.validation.maxSentenceLength) {
    res.status(400).json({
      error: 'Bad Request',
      message: `Sentence exceeds maximum length of ${config.validation.maxSentenceLength} characters`,
    });
    return;
  }

  // Check Chinese character ratio
  const chineseRatio = getChineseRatio(trimmed);
  if (chineseRatio < config.validation.minChineseRatio) {
    res.status(400).json({
      error: 'Bad Request',
      message: `At least ${config.validation.minChineseRatio * 100}% of the text must be Chinese characters`,
    });
    return;
  }

  // Validation passed - attach to request
  req.validatedText = trimmed;
  next();
}
