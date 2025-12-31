import { Router, Request, Response } from 'express';
import { definitionLookup } from '../services/dictionary.js';
import { lookupRateLimit } from '../middleware/rateLimit.js';
import type { LookupRequest } from '../types/index.js';

const router = Router();

/**
 * POST /definitionLookup
 * 
 * Look up a Chinese token in the dictionary.
 * Returns dictionary entries with pinyin and definitions.
 * If the token isn't found directly, attempts recursive segmentation.
 * 
 * Request body: { token: string }
 * Response: { entries: DictionaryEntry[], segments?: string[] }
 */
router.post('/definitionLookup', lookupRateLimit, (req: Request<{}, {}, LookupRequest>, res: Response) => {
  const { token } = req.body;

  // Validate input
  if (!token || typeof token !== 'string') {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Missing or invalid "token" in request body',
    });
    return;
  }

  const trimmedToken = token.trim();
  if (trimmedToken === '') {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Token cannot be empty',
    });
    return;
  }

  // Limit token length to prevent expensive recursive segmentation
  if (trimmedToken.length > 100) {
    res.status(400).json({
      error: 'Bad Request',
      message: 'Token exceeds maximum length of 100 characters',
    });
    return;
  }

  try {
    const result = definitionLookup(trimmedToken);

    if (result === null) {
      res.status(404).json({
        error: 'Not Found',
        message: `No dictionary entries found for "${trimmedToken}"`,
      });
      return;
    }

    res.json(result);
  } catch (error) {
    console.error('Error in /definitionLookup:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred while looking up the token',
    });
  }
});

export default router;
