import { Router, Request, Response as ExpressResponse, NextFunction } from 'express';
import {
  streamParseV2,
  estimateStreamParseV2PromptTokens,
  estimateTokensFromText,
  extractOpenRouterUsageFromSseLine,
  isConfigured,
  logOpenRouterUsage,
  type OpenRouterStreamUsage,
} from '../services/ai.js';
import { validateChineseInput, ValidatedRequest } from '../middleware/validation.js';
import { parseRateLimit, parseRequestAbuseRateLimit } from '../middleware/rateLimit.js';
import { HttpError } from '../middleware/errorHandler.js';
import { buildPinyinMap } from '../services/pinyinCorrection.js';
import { buildProvisionalSegments } from '../services/provisionalSegments.js';
import { createStreamStateV2, processStreamBufferV2 } from '../services/streamProcessorV2.js';
import { extractDeltaContent } from '../services/streamProcessor.js';
import { hydrateGrammarPoints } from '../data/grammarPatterns.js';
import { logParseError, validateStreamOutput } from '../services/parseErrorLog.js';
import { hasChinese } from '../utils/chinese.js';

const router = Router();

/**
 * The v2 pipeline is text-only for now. Image input goes through /parse.
 */
function rejectImageInput(req: Request, res: ExpressResponse, next: NextFunction): void {
  if (req.body?.image) {
    res.status(400).json({
      error: 'Bad Request',
      message: '/parse2 supports text input only; use /parse for images',
    });
    return;
  }
  next();
}

function setSseHeaders(res: ExpressResponse): void {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
}

/** Write a named SSE event with a JSON payload */
function writeEvent(res: ExpressResponse, event: string, data: unknown): void {
  // Leading newline terminates any preceding data line (the delta lines are
  // written with a single \n, matching the v1 protocol)
  res.write(`\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/** Write a model content delta in the same format the v1 client already parses */
function writeContentDelta(res: ExpressResponse, content: string): void {
  res.write(`data: {"choices":[{"delta":{"content":${JSON.stringify(content)}}}]}\n`);
}

function sendImmediateTranslation(res: ExpressResponse, sentence: string): void {
  setSseHeaders(res);
  writeContentDelta(res, JSON.stringify({
    translation: sentence,
    segments: [],
    translationParts: [],
  }));
  writeEvent(res, 'grammar', { grammarPoints: [] });
  res.write('data: [DONE]\n');
  res.end();
}

/**
 * Hydrate grammar points from the already-parsed model output.
 * Logs when the model emitted points but none survived hydration
 * (hallucinated pattern IDs / malformed entries).
 */
function extractGrammarPoints(
  parsedOutput: unknown | null,
  sentence: string
): ReturnType<typeof hydrateGrammarPoints> {
  if (!parsedOutput || typeof parsedOutput !== 'object') return [];

  const rawPoints = (parsedOutput as { grammarPoints?: unknown }).grammarPoints;
  const hydrated = hydrateGrammarPoints(rawPoints);

  if (Array.isArray(rawPoints) && rawPoints.length > 0 && hydrated.length === 0) {
    logParseError({
      route: 'parse2',
      stage: 'grammar-extraction',
      message: `All ${rawPoints.length} grammar point(s) dropped during hydration`,
      sentence,
      raw: JSON.stringify(rawPoints),
    });
  }

  return hydrated;
}

/**
 * POST /parse2
 *
 * V2 text parse pipeline:
 *  - Stage 0 (~1ms): provisional segments from CC-CEDICT greedy matching +
 *    context-aware pinyin map, emitted immediately as `event: provisional`
 *    so the client can render a skeleton before the LLM responds.
 *  - Stage 1: LLM stream with a trimmed schema (segments carry no pinyin)
 *    and grammar pattern recognition against a fixed catalog.
 *  - Stage 2 (in-stream): authoritative pinyin injected after each token;
 *    at end of stream, grammar point IDs are hydrated from the catalog and
 *    emitted as `event: grammar`.
 *
 * SSE protocol:
 *  - event: provisional  data: { "segments": [...] }
 *  - data: {"choices":[{"delta":{"content":"..."}}]}   (v1-compatible deltas)
 *  - event: grammar      data: { "grammarPoints": [...] }
 *  - data: [DONE]
 */
router.post('/parse2', parseRequestAbuseRateLimit, rejectImageInput, validateChineseInput, parseRateLimit, async (req: ValidatedRequest, res: ExpressResponse) => {
  try {
    if (!isConfigured()) {
      throw new HttpError(503, 'AI service not configured');
    }

    const sentence = req.validatedText!;

    if (!hasChinese(sentence)) {
      sendImmediateTranslation(res, sentence);
      return;
    }

    // Stage 0: pinyin map (~5ms) + provisional segments (~1ms), emitted
    // before the LLM request is even dispatched
    const pinyinMap = buildPinyinMap(sentence);
    const provisionalSegments = buildProvisionalSegments(sentence, pinyinMap);

    setSseHeaders(res);
    writeEvent(res, 'provisional', { segments: provisionalSegments });
    // Flush headers + provisional immediately (express buffers otherwise)
    res.flushHeaders?.();

    // Stage 1: LLM stream
    const aiResponse = await streamParseV2(sentence, req.validatedContext);

    if (!aiResponse.body) {
      writeEvent(res, 'error', { message: 'No response body from AI service' });
      res.end();
      return;
    }

    const reader = aiResponse.body.getReader();
    const decoder = new TextDecoder();

    let clientDisconnected = false;
    let streamState = createStreamStateV2();
    let sseLineBuffer = '';
    let upstreamUsage: OpenRouterStreamUsage | null = null;
    let outputContent = '';
    let emittedContent = '';
    let usageLogged = false;

    const logUsage = (completed: boolean) => {
      if (usageLogged) return;
      usageLogged = true;

      logOpenRouterUsage({
        route: 'parse-text-v2',
        usage: upstreamUsage,
        estimatedPromptTokens: estimateStreamParseV2PromptTokens(sentence, req.validatedContext),
        estimatedCompletionTokens: estimateTokensFromText(outputContent),
        outputChars: outputContent.length,
        completed,
      });
    };

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
            writeContentDelta(res, streamState.buffer);
            emittedContent += streamState.buffer;
          }
          // Validate the completed stream (raw vs emitted) and log breakage;
          // the truncated output after a client disconnect is not an error
          const parsedOutput = clientDisconnected
            ? null
            : validateStreamOutput({
                route: 'parse2',
                sentence,
                raw: outputContent,
                emitted: emittedContent,
              });
          // Stage 2 (tail): hydrate grammar point IDs from the catalog
          writeEvent(res, 'grammar', { grammarPoints: extractGrammarPoints(parsedOutput, sentence) });
          res.write('data: [DONE]\n');
          res.end();
          logUsage(true);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        sseLineBuffer += chunk;

        const lines = sseLineBuffer.split('\n');
        sseLineBuffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();

          if (!trimmedLine) {
            res.write('\n');
            continue;
          }

          if (trimmedLine === 'data: [DONE]') {
            // Emitted after the grammar event when done is true
            continue;
          }

          const usage = extractOpenRouterUsageFromSseLine(trimmedLine);
          if (usage) {
            upstreamUsage = usage;
            continue;
          }

          const content = extractDeltaContent(trimmedLine);

          if (content !== null) {
            outputContent += content;

            streamState.buffer += content;
            const result = processStreamBufferV2(streamState, pinyinMap);
            streamState = result.state;

            if (result.toEmit) {
              writeContentDelta(res, result.toEmit);
              emittedContent += result.toEmit;
            }
          } else if (trimmedLine.startsWith(':')) {
            // SSE comment (like ": OPENROUTER PROCESSING") - pass through
            res.write(trimmedLine + '\n');
          }
        }
      }
    } catch (streamError) {
      if (!clientDisconnected) {
        logParseError({
          route: 'parse2',
          stage: 'stream',
          message: streamError instanceof Error ? streamError.message : String(streamError),
          sentence,
        });
      }
      if (!res.writableEnded) {
        res.end();
      }
    } finally {
      logUsage(false);
    }
  } catch (error) {
    console.error('Error in /parse2:', error);

    if (!res.headersSent) {
      // Re-throw to centralized error handler (which sanitizes messages)
      throw error;
    } else if (!res.writableEnded) {
      writeEvent(res, 'error', { message: 'An unexpected error occurred' });
      res.end();
    }
  }
});

export default router;
