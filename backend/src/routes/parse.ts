import { Router, Response } from 'express';
import { streamParse, isConfigured, getConfigStatus } from '../services/ai.js';
import { validateChineseInput, ValidatedRequest } from '../middleware/validation.js';
import { parseRateLimit } from '../middleware/rateLimit.js';

const router = Router();

/**
 * POST /parse
 * 
 * Parse a Chinese sentence into word segments with pinyin and definitions.
 * Uses AI (OpenRouter) for intelligent segmentation.
 * 
 * Request body: { sentence: string }
 * Response: SSE stream with AI chunks
 * 
 * The stream follows OpenAI's SSE format:
 * - data: {"choices":[{"delta":{"content":"..."}}]}
 * - data: [DONE]
 */
router.post('/parse', parseRateLimit, validateChineseInput, async (req: ValidatedRequest, res: Response) => {
  const sentence = req.validatedText!;

  // Check if AI is configured
  if (!isConfigured()) {
    res.status(503).json({
      error: 'Service Unavailable',
      message: `AI service not configured: ${getConfigStatus()}`,
    });
    return;
  }

  try {
    // Get streaming response from OpenRouter
    const aiResponse = await streamParse(sentence);

    if (!aiResponse.body) {
      res.status(502).json({
        error: 'Bad Gateway',
        message: 'No response body from AI service',
      });
      return;
    }

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Stream the response
    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          res.end();
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    } catch (streamError) {
      console.error('Error during streaming:', streamError);
      // Connection likely closed by client
      if (!res.writableEnded) {
        res.end();
      }
    }
  } catch (error) {
    console.error('Error in /parse:', error);
    
    // If headers haven't been sent, send error response
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'An error occurred while parsing',
      });
    } else {
      // Headers already sent (streaming started), just end the response
      res.end();
    }
  }
});

export default router;
