import { Router, Request, Response as ExpressResponse } from 'express';
import { 
  streamSegmentation,
  getTranslationAlignment,
  streamParseImage, 
  isConfigured, 
  isVisionConfigured, 
  getConfigStatus, 
  getVisionConfigStatus 
} from '../services/ai.js';
import { validateParseInput, ValidatedRequest } from '../middleware/validation.js';
import { parseRateLimit } from '../middleware/rateLimit.js';
import { 
  buildPinyinMap, 
  getPinyinFromMap, 
  findTokenPosition,
  type PinyinMap 
} from '../services/pinyinCorrection.js';

const router = Router();

/**
 * Captured data from Stage 1 streaming for use in Stage 2
 */
interface CapturedParseResult {
  translation: string;
  segments: Array<{ id: number; token: string }>;
}

/**
 * State machine for real-time pinyin correction in streaming JSON
 * 
 * Tracks position in the JSON structure to:
 * 1. Detect when we're inside the "segments" array
 * 2. Capture the "token" value of each segment
 * 3. Replace the "pinyin" value with the corrected version
 */
interface StreamState {
  // Accumulated content buffer for parsing
  buffer: string;
  // Are we currently inside the segments array?
  inSegmentsArray: boolean;
  // Current segment's token (captured when we see "token": "xxx")
  currentToken: string | null;
  // Position in original sentence for token lookup
  sentencePosition: number;
  // Are we currently capturing a pinyin value to replace?
  capturingPinyin: boolean;
  // The pinyin value being captured (to be replaced)
  capturedPinyin: string;
}

function createStreamState(): StreamState {
  return {
    buffer: '',
    inSegmentsArray: false,
    currentToken: null,
    sentencePosition: 0,
    capturingPinyin: false,
    capturedPinyin: '',
  };
}

/**
 * Process the accumulated buffer and emit corrected content
 * 
 * This function processes the JSON stream character by character, tracking state
 * to detect segment objects and replace pinyin values.
 * 
 * Returns content that's safe to emit and updates the state.
 */
function processStreamBuffer(
  state: StreamState,
  pinyinMap: PinyinMap
): { toEmit: string; state: StreamState } {
  let { buffer, inSegmentsArray, currentToken, sentencePosition, capturingPinyin, capturedPinyin } = state;
  
  let toEmit = '';
  let i = 0;
  
  while (i < buffer.length) {
    // Check for "segments" array start
    if (!inSegmentsArray) {
      const segmentsMatch = buffer.slice(i).match(/^"segments"\s*:\s*\[/);
      if (segmentsMatch) {
        toEmit += buffer.slice(0, i) + segmentsMatch[0];
        buffer = buffer.slice(i + segmentsMatch[0].length);
        i = 0;
        inSegmentsArray = true;
        continue;
      }
    }
    
    // Inside segments array - look for token and pinyin
    if (inSegmentsArray) {
      // Check for end of segments array
      if (buffer[i] === ']' && !capturingPinyin) {
        // Make sure this ] closes the segments array, not something nested
        // Simple heuristic: if we see ], assume it's the end
        inSegmentsArray = false;
        currentToken = null;
      }
      
      // Look for "token": "value" pattern
      const tokenMatch = buffer.slice(i).match(/^"token"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      if (tokenMatch) {
        currentToken = JSON.parse(`"${tokenMatch[1]}"`); // Unescape the string
        toEmit += buffer.slice(0, i) + tokenMatch[0];
        buffer = buffer.slice(i + tokenMatch[0].length);
        i = 0;
        continue;
      }
      
      // Look for "pinyin": " pattern (start of pinyin value)
      const pinyinStartMatch = buffer.slice(i).match(/^"pinyin"\s*:\s*"/);
      if (pinyinStartMatch && currentToken !== null) {
        // Found start of pinyin - emit everything up to and including the opening quote
        toEmit += buffer.slice(0, i) + pinyinStartMatch[0];
        buffer = buffer.slice(i + pinyinStartMatch[0].length);
        i = 0;
        capturingPinyin = true;
        capturedPinyin = '';
        continue;
      }
      
      // If capturing pinyin, look for the closing quote
      if (capturingPinyin) {
        // Find the end of the pinyin string value
        let j = 0;
        while (j < buffer.length) {
          if (buffer[j] === '"' && (j === 0 || buffer[j-1] !== '\\')) {
            // Found closing quote
            capturedPinyin = buffer.slice(0, j);
            
            // Get corrected pinyin
            let correctedPinyin = capturedPinyin;
            if (currentToken) {
              const tokenPos = findTokenPosition(pinyinMap.sentence, currentToken, sentencePosition);
              if (tokenPos >= 0) {
                const newPinyin = getPinyinFromMap(pinyinMap, currentToken, tokenPos);
                if (newPinyin) {
                  correctedPinyin = newPinyin;
                }
                sentencePosition = tokenPos + currentToken.length;
              }
            }
            
            // Emit the corrected pinyin and closing quote
            toEmit += correctedPinyin + '"';
            buffer = buffer.slice(j + 1);
            i = 0;
            capturingPinyin = false;
            capturedPinyin = '';
            currentToken = null; // Reset for next segment
            break;
          }
          j++;
        }
        
        if (capturingPinyin) {
          // Haven't found closing quote yet - keep buffering
          // Don't emit anything, keep the buffer as-is
          return {
            toEmit,
            state: { buffer, inSegmentsArray, currentToken, sentencePosition, capturingPinyin, capturedPinyin: buffer }
          };
        }
        continue;
      }
    }
    
    i++;
  }
  
  // Determine how much is safe to emit
  if (capturingPinyin) {
    // Still capturing pinyin - don't emit buffer yet
    return {
      toEmit,
      state: { buffer, inSegmentsArray, currentToken, sentencePosition, capturingPinyin, capturedPinyin }
    };
  }
  
  // Check if we might be at a partial match for a key pattern
  // Keep some buffer to avoid splitting patterns
  const keepLength = Math.min(50, buffer.length); // Keep last 50 chars for pattern matching
  const safeToEmit = buffer.slice(0, Math.max(0, buffer.length - keepLength));
  const remaining = buffer.slice(Math.max(0, buffer.length - keepLength));
  
  toEmit += safeToEmit;
  
  return {
    toEmit,
    state: { 
      buffer: remaining, 
      inSegmentsArray, 
      currentToken, 
      sentencePosition, 
      capturingPinyin, 
      capturedPinyin 
    }
  };
}

/**
 * Extract JSON content from SSE data lines
 * Returns the delta content string or null if not a content chunk
 */
function extractDeltaContent(sseData: string): string | null {
  if (!sseData.startsWith('data: ')) return null;
  
  const jsonStr = sseData.slice(6).trim();
  if (jsonStr === '[DONE]') return null;
  
  try {
    const parsed = JSON.parse(jsonStr);
    return parsed?.choices?.[0]?.delta?.content ?? null;
  } catch {
    return null;
  }
}

/**
 * Stream an AI response with real-time pinyin correction.
 * 
 * This function intercepts the SSE stream and corrects pinyin values
 * in real-time as segments arrive, using a pre-computed pinyin map.
 * 
 * Returns captured translation and segments for use in Stage 2 alignment.
 * Does NOT send [DONE] - caller is responsible for that.
 */
async function streamResponseWithCorrection(
  aiResponse: Response, 
  req: Request, 
  res: ExpressResponse,
  pinyinMap: PinyinMap
): Promise<CapturedParseResult | null> {
  if (!aiResponse.body) {
    res.status(502).json({
      error: 'Bad Gateway',
      message: 'No response body from AI service',
    });
    return null;
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
  let fullContent = ''; // Capture full JSON content for Stage 2

  req.on('close', () => {
    clientDisconnected = true;
    reader.cancel().catch(() => {});
  });

  try {
    while (!clientDisconnected) {
      const { done, value } = await reader.read();
      
      if (done) {
        // Flush any remaining buffer for output (but don't add to fullContent - already there)
        if (streamState.buffer) {
          const sseChunk = `data: {"choices":[{"delta":{"content":${JSON.stringify(streamState.buffer)}}}]}\n`;
          res.write(sseChunk);
        }
        // Don't send [DONE] here - let caller handle it after Stage 2
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
          // Don't emit [DONE] yet - we'll do it after Stage 2
          continue;
        }
        
        // Extract content from SSE
        const content = extractDeltaContent(trimmedLine);
        
        if (content !== null) {
          // Capture full content for later parsing
          fullContent += content;
          
          // Add to buffer and process for pinyin correction
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

    // Parse the complete JSON to extract data for Stage 2
    try {
      const parsed = JSON.parse(fullContent);
      return {
        translation: parsed.translation || '',
        segments: (parsed.segments || []).map((s: { id: number; token: string }) => ({ 
          id: s.id, 
          token: s.token 
        })),
      };
    } catch (parseError) {
      console.warn('Failed to parse Stage 1 JSON for Stage 2:', parseError);
      return null;
    }
  } catch (streamError) {
    if (!clientDisconnected) {
      console.error('Error during streaming:', streamError);
    }
    if (!res.writableEnded) {
      res.end();
    }
    return null;
  }
}



/**
 * POST /parse
 * 
 * Parse Chinese text into word segments with pinyin and definitions.
 * Accepts either text input or image input (for OCR).
 * Uses a two-stage AI pipeline:
 *   Stage 1: Segmentation (streaming) - translation + segments
 *   Stage 2: Alignment (non-streaming) - translationParts
 * 
 * For text input: Applies real-time pinyin correction using pinyin-pro
 * For image input: Uses legacy single-model pipeline (TODO: update to two-stage)
 * 
 * Request body: { sentence: string } OR { image: string (base64 data URL) }
 * Response: SSE stream with AI chunks
 * 
 * The stream follows OpenAI's SSE format with an additional event type:
 * - data: {"choices":[{"delta":{"content":"..."}}]}  (Stage 1 streaming)
 * - data: {"type":"translationParts","data":[...]}   (Stage 2 result)
 * - data: [DONE]
 */
router.post('/parse', parseRateLimit, validateParseInput, async (req: ValidatedRequest, res: ExpressResponse) => {
  const isImageInput = !!req.validatedImage;

  try {
    if (isImageInput) {
      // Image input - legacy pipeline (OCR then single-model parse)
      // TODO: Update to three-stage pipeline (OCR → Segmentation → Alignment)
      if (!isVisionConfigured()) {
        res.status(503).json({
          error: 'Service Unavailable',
          message: `Vision AI service not configured: ${getVisionConfigStatus()}`,
        });
        return;
      }

      // Stage 1: OCR extracts text, Stage 2: Parse with text model (legacy)
      const { response, extractedText } = await streamParseImage(req.validatedImage!);
      
      // Build pinyin map from OCR'd text for correction
      const pinyinMap = buildPinyinMap(extractedText);
      
      // Stream with pinyin correction
      await streamResponseWithCorrection(response, req, res, pinyinMap);
      
      // Send [DONE] for legacy pipeline
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    // Text input - NEW two-stage pipeline
    if (!isConfigured()) {
      res.status(503).json({
        error: 'Service Unavailable',
        message: `AI service not configured: ${getConfigStatus()}`,
      });
      return;
    }

    const sentence = req.validatedText!;
    
    // Build pinyin map for context-aware correction (~5ms)
    const pinyinMap = buildPinyinMap(sentence);
    
    // Stage 1: Stream segmentation (translation + segments)
    const segmentationResponse = await streamSegmentation(sentence);
    const captured = await streamResponseWithCorrection(segmentationResponse, req, res, pinyinMap);
    
    // Stage 2: Get alignment (after Stage 1 completes)
    if (captured && captured.translation && captured.segments.length > 0) {
      const alignment = await getTranslationAlignment(
        captured.translation,
        captured.segments
      );
      
      if (alignment) {
        // Send translationParts as separate SSE event
        const event = JSON.stringify({
          type: 'translationParts',
          data: alignment.translationParts,
        });
        res.write(`data: ${event}\n\n`);
      }
      // If alignment fails, we just don't send translationParts - graceful degradation
    }
    
    // Send [DONE] after both stages complete
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('Error in /parse:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'An error occurred while parsing',
      });
    } else {
      // If headers already sent, try to send error and close
      try {
        res.write('data: [DONE]\n\n');
      } catch {
        // Ignore write errors
      }
      res.end();
    }
  }
});

export default router;
