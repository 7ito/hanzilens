import { Router, Request, Response as ExpressResponse } from 'express';
import { 
  streamParse, 
  streamParseImage, 
  isConfigured, 
  isVisionConfigured, 
  getConfigStatus, 
  getVisionConfigStatus 
} from '../services/ai.js';
import { validateParseInput, ValidatedRequest } from '../middleware/validation.js';
import { parseRateLimit } from '../middleware/rateLimit.js';

const router = Router();

/**
 * Stream an AI response (fetch Response) to the client via SSE.
 * Handles client disconnection by canceling the AI stream.
 */
async function streamResponse(aiResponse: Response, req: Request, res: ExpressResponse): Promise<void> {
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
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx/Caddy buffering

  // Stream the response
  const reader = aiResponse.body.getReader();
  const decoder = new TextDecoder();

  // Track if client disconnected
  let clientDisconnected = false;

  // Handle client disconnect - cancel the AI stream to save resources
  req.on('close', () => {
    clientDisconnected = true;
    reader.cancel().catch(() => {
      // Ignore cancel errors (stream may already be done)
    });
  });

  try {
    while (!clientDisconnected) {
      const { done, value } = await reader.read();
      
      if (done) {
        res.end();
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);
    }
  } catch (streamError) {
    // Only log if not a client disconnect
    if (!clientDisconnected) {
      console.error('Error during streaming:', streamError);
    }
    if (!res.writableEnded) {
      res.end();
    }
  }
}

/**
 * POST /parse
 * 
 * Parse Chinese text into word segments with pinyin and definitions.
 * Accepts either text input or image input (for OCR).
 * Uses AI (OpenRouter) for intelligent segmentation.
 * 
 * Request body: { sentence: string } OR { image: string (base64 data URL) }
 * Response: SSE stream with AI chunks
 * 
 * The stream follows OpenAI's SSE format:
 * - data: {"choices":[{"delta":{"content":"..."}}]}
 * - data: [DONE]
 */
router.post('/parse', parseRateLimit, validateParseInput, async (req: ValidatedRequest, res: ExpressResponse) => {
  const isImageInput = !!req.validatedImage;

  try {
    let aiResponse: Response;

    if (isImageInput) {
      // Image input - use vision model
      if (!isVisionConfigured()) {
        res.status(503).json({
          error: 'Service Unavailable',
          message: `Vision AI service not configured: ${getVisionConfigStatus()}`,
        });
        return;
      }

      aiResponse = await streamParseImage(req.validatedImage!);
    } else {
      // Text input - use text model
      if (!isConfigured()) {
        res.status(503).json({
          error: 'Service Unavailable',
          message: `AI service not configured: ${getConfigStatus()}`,
        });
        return;
      }

      aiResponse = await streamParse(req.validatedText!);
    }

    await streamResponse(aiResponse, req, res);
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
