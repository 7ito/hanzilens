import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

// Regex to match Chinese characters (CJK Unified Ideographs)
const CHINESE_CHAR_REGEX = /[\u4e00-\u9fff]/g;

// Regex to match base64 data URL format
const DATA_URL_REGEX = /^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/]+=*)$/;

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
 * Express request with validated input attached
 */
export interface ValidatedRequest extends Request {
  validatedText?: string;
  validatedImage?: string; // Base64 data URL for image input
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

/**
 * Parse a base64 data URL and return the mime type and decoded size
 */
function parseDataUrl(dataUrl: string): { mimeType: string; sizeBytes: number } | null {
  const match = dataUrl.match(DATA_URL_REGEX);
  if (!match) return null;

  const mimeType = match[1];
  const base64Data = match[2];
  
  // Calculate decoded size (base64 is ~4/3 the size of binary)
  const sizeBytes = Math.ceil((base64Data.length * 3) / 4);
  
  return { mimeType, sizeBytes };
}

/**
 * Middleware to validate image input for the /parse endpoint.
 * 
 * Validates:
 * - Request body has an `image` field
 * - Image is a valid base64 data URL
 * - Image mime type is allowed (jpeg, png, webp, gif)
 * - Image size is within limit (5MB)
 * 
 * On success, attaches `validatedImage` to the request object.
 */
export function validateImageInput(
  req: ValidatedRequest,
  res: Response,
  next: NextFunction
): void {
  const { image } = req.body;

  // Check for presence
  if (!image || typeof image !== 'string') {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Missing or invalid "image" in request body',
    });
    return;
  }

  // Parse and validate data URL format
  const parsed = parseDataUrl(image);
  if (!parsed) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid image format. Expected base64 data URL (e.g., data:image/jpeg;base64,...)',
    });
    return;
  }

  // Check mime type
  const allowedTypes = config.image.allowedMimeTypes as readonly string[];
  if (!allowedTypes.includes(parsed.mimeType)) {
    res.status(400).json({
      error: 'Bad Request',
      message: `Unsupported image type: ${parsed.mimeType}. Allowed: ${allowedTypes.join(', ')}`,
    });
    return;
  }

  // Check size
  if (parsed.sizeBytes > config.image.maxSizeBytes) {
    const maxMB = config.image.maxSizeBytes / (1024 * 1024);
    const actualMB = (parsed.sizeBytes / (1024 * 1024)).toFixed(2);
    res.status(400).json({
      error: 'Bad Request',
      message: `Image too large (${actualMB}MB). Maximum size is ${maxMB}MB`,
    });
    return;
  }

  // Validation passed - attach to request
  req.validatedImage = image;
  next();
}

/**
 * Middleware to validate parse input - either sentence or image.
 * Determines which type of input was provided and validates accordingly.
 */
export function validateParseInput(
  req: ValidatedRequest,
  res: Response,
  next: NextFunction
): void {
  const { sentence, image } = req.body;

  // Check that exactly one of sentence or image is provided
  if (sentence && image) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Provide either "sentence" or "image", not both',
    });
    return;
  }

  if (!sentence && !image) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Missing "sentence" or "image" in request body',
    });
    return;
  }

  // Route to appropriate validator
  if (sentence) {
    validateChineseInput(req, res, next);
  } else {
    validateImageInput(req, res, next);
  }
}
