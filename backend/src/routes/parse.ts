import { Router, Request, Response as ExpressResponse } from 'express';
import { 
  streamParse, 
  streamParseImage, 
  ocrImage,
  isConfigured, 
  isVisionConfigured,
} from '../services/ai.js';
import { validateParseInput, validateImageInput, ValidatedRequest } from '../middleware/validation.js';
import { parseRateLimit } from '../middleware/rateLimit.js';
import { HttpError } from '../middleware/errorHandler.js';
import { buildPinyinMap, type PinyinMap } from '../services/pinyinCorrection.js';
import { createStreamState, processStreamBuffer, extractDeltaContent } from '../services/streamProcessor.js';
import { hasChinese } from '../utils/chinese.js';

const router = Router();

function sendImmediateTranslation(res: ExpressResponse, sentence: string): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const payload = JSON.stringify({
    translation: sentence,
    segments: [],
    translationParts: [],
  });
  const sseChunk = `data: ${JSON.stringify({ choices: [{ delta: { content: payload } }] })}\n`;
  res.write(sseChunk);
  res.write('data: [DONE]\n');
  res.end();
}

/**
 * POST /ocr
 *
 * Extract canonical OCR text + layout from an image.
 * Request body: { image: string (base64 data URL) }
 * Response: {
 *   imageSize?,
 *   text,
 *   readingDirection,
 *   lines: [{ id, text, startOffset, endOffset, box, wordIds, confidence? }],
 *   words: [{ id, text, startOffset, endOffset, lineId, box, confidence? }]
 * }
 */
router.post('/ocr', parseRateLimit, validateImageInput, async (req: ValidatedRequest, res: ExpressResponse) => {
  try {
    if (!isVisionConfigured()) {
      throw new HttpError(503, 'AI service not configured');
    }

    const ocrResult = await ocrImage(req.validatedImage!);
    res.json(ocrResult);
  } catch (error) {
    if (error instanceof HttpError) throw error;

    const message = error instanceof Error ? error.message : '';

    if (message.includes('Could not extract sufficient Chinese text')) {
      res.status(422).json({
        error: 'no_chinese_text',
        message: 'Could not extract sufficient Chinese text from image',
      });
      return;
    }

    console.error('Error in /ocr:', error);
    throw new HttpError(500, 'An unexpected error occurred');
  }
});

/**
 * Stream an AI response with real-time pinyin correction.
 * 
 * This function intercepts the SSE stream and corrects pinyin values
 * in real-time as segments arrive, using a pre-computed pinyin map.
 */
async function streamResponseWithCorrection(
  aiResponse: Response, 
  req: Request, 
  res: ExpressResponse,
  pinyinMap: PinyinMap
): Promise<void> {
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
  res.setHeader('X-Accel-Buffering', 'no');

  const reader = aiResponse.body.getReader();
  const decoder = new TextDecoder();

  let clientDisconnected = false;
  let streamState = createStreamState();
  let sseLineBuffer = '';

  req.on('close', () => {
    clientDisconnected = true;
    reader.cancel().catch(() => {});
  });

  try {
    while (!clientDisconnected) {
      const { done, value } = await reader.read();
      
      if (done) {
        // Flush any remaining buffer
        if (streamState.buffer) {
          const sseChunk = `data: {"choices":[{"delta":{"content":${JSON.stringify(streamState.buffer)}}}]}\n`;
          res.write(sseChunk);
        }
        res.write('data: [DONE]\n');
        res.end();
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      sseLineBuffer += chunk;
      
      // Process complete SSE lines
      const lines = sseLineBuffer.split('\n');
      sseLineBuffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (!trimmedLine) {
          // Empty line - SSE delimiter, pass through
          res.write('\n');
          continue;
        }
        
        if (trimmedLine === 'data: [DONE]') {
          // Don't emit [DONE] yet - we'll do it when done is true
          continue;
        }
        
        // Extract content from SSE
        const content = extractDeltaContent(trimmedLine);
        
        if (content !== null) {
          // Add to buffer and process
          streamState.buffer += content;
          
          const result = processStreamBuffer(streamState, pinyinMap);
          streamState = result.state;
          
          // Emit any processed content
          if (result.toEmit) {
            const sseChunk = `data: {"choices":[{"delta":{"content":${JSON.stringify(result.toEmit)}}}]}\n`;
            res.write(sseChunk);
          }
        } else if (trimmedLine.startsWith(':')) {
          // SSE comment (like ": OPENROUTER PROCESSING") - pass through
          res.write(trimmedLine + '\n');
        }
      }
    }
  } catch (streamError) {
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
 * For text input: Applies real-time pinyin correction using pinyin-pro
 * For image input: Applies pinyin correction to the OCR-extracted text before streaming
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
      // Image input - two-stage pipeline: OCR then parse
      if (!isVisionConfigured()) {
        throw new HttpError(503, 'AI service not configured');
      }

      // Stage 1: OCR extracts text, Stage 2: Parse with text model
      const { response, extractedText } = await streamParseImage(req.validatedImage!);
      aiResponse = response;
      
      // Build pinyin map from OCR'd text for correction
      const pinyinMap = buildPinyinMap(extractedText);
      
      // Stream with pinyin correction (same as text input now!)
      await streamResponseWithCorrection(aiResponse, req, res, pinyinMap);
    } else {
      // Text input - use text model
      if (!isConfigured()) {
        throw new HttpError(503, 'AI service not configured');
      }

      const sentence = req.validatedText!;

      if (!hasChinese(sentence)) {
        sendImmediateTranslation(res, sentence);
        return;
      }
       
      // Build pinyin map for context-aware correction (~5ms)
      const pinyinMap = buildPinyinMap(sentence);
      
      aiResponse = await streamParse(sentence, req.validatedContext);
      
      // Text - stream with real-time pinyin correction
      await streamResponseWithCorrection(aiResponse, req, res, pinyinMap);
    }
  } catch (error) {
    console.error('Error in /parse:', error);
    
    if (!res.headersSent) {
      // Re-throw to centralized error handler (which sanitizes messages)
      throw error;
    } else {
      // Headers already sent (streaming started) - just end the response
      res.end();
    }
  }
});

export default router;
