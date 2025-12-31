import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

// Regex to match Chinese characters (CJK Unified Ideographs)
const CHINESE_CHAR_REGEX = /[\u4e00-\u9fff]/g;

// Regex to match CJK punctuation that should be excluded from ratio calculation
// - CJK Symbols and Punctuation: U+3000-U+303F (。、「」『』【】《》〈〉 etc.)
// - Halfwidth and Fullwidth Forms: U+FF00-U+FFEF (，；： fullwidth punctuation)
// - General Punctuation subset: U+2018-U+201F (curly quotes used in CJK)
const CJK_PUNCTUATION_REGEX = /[\u3000-\u303f\uff00-\uffef\u2018-\u201f]/g;

/**
 * Count Chinese characters in a string
 */
function countChineseChars(text: string): number {
  const matches = text.match(CHINESE_CHAR_REGEX);
  return matches ? matches.length : 0;
}

/**
 * Count CJK punctuation characters in a string
 */
function countCjkPunctuation(text: string): number {
  const matches = text.match(CJK_PUNCTUATION_REGEX);
  return matches ? matches.length : 0;
}

/**
 * Calculate the ratio of Chinese characters in a string.
 * CJK punctuation is excluded from the denominator so it doesn't
 * count against the Chinese ratio (e.g., 《》 won't reduce the ratio).
 */
function getChineseRatio(text: string): number {
  if (text.length === 0) return 0;
  
  const cjkPunctuationCount = countCjkPunctuation(text);
  const effectiveLength = text.length - cjkPunctuationCount;
  
  // If the text is only CJK punctuation, consider it valid
  if (effectiveLength === 0) return 1;
  
  return countChineseChars(text) / effectiveLength;
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
