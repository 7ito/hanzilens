/**
 * Cumulative parse-error log for debugging malformed model output.
 *
 * Every entry is one NDJSON line in logs/parse-errors.ndjson (gitignored).
 * The interesting failure mode is "the client received JSON it cannot parse",
 * which has two distinct causes worth telling apart:
 *  - stage "model-output":     the raw LLM output itself is not valid JSON
 *  - stage "pinyin-injection": the raw output parsed fine, but the content we
 *                              emitted after in-stream pinyin injection does not
 *
 * View recent entries with `npm run errors`.
 */

import { appendFile, mkdir, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config/index.js';

export const PARSE_ERROR_LOG_PATH = path.resolve(process.cwd(), 'logs/parse-errors.ndjson');

/** Rotate to .1 beyond this size so the log never grows unbounded */
const MAX_LOG_BYTES = 5 * 1024 * 1024;
/** Cap stored payloads — enough to see the breakage, not the whole stream */
const MAX_PAYLOAD_CHARS = 20_000;

export type ParseErrorStage =
  | 'model-output'
  | 'pinyin-injection'
  | 'grammar-extraction'
  | 'stream';

export interface ParseErrorEntry {
  route: string;
  stage: ParseErrorStage;
  message: string;
  sentence?: string;
  /** Raw model output as received from the provider */
  raw?: string;
  /** Content actually emitted to the client (after pinyin injection) */
  emitted?: string;
}

function cap(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  return text.length > MAX_PAYLOAD_CHARS
    ? `${text.slice(0, MAX_PAYLOAD_CHARS)}…[truncated ${text.length - MAX_PAYLOAD_CHARS} chars]`
    : text;
}

async function rotateIfNeeded(): Promise<void> {
  try {
    const { size } = await stat(PARSE_ERROR_LOG_PATH);
    if (size > MAX_LOG_BYTES) {
      await rename(PARSE_ERROR_LOG_PATH, `${PARSE_ERROR_LOG_PATH}.1`);
    }
  } catch {
    // Log file doesn't exist yet — nothing to rotate
  }
}

/**
 * Append an entry to the parse-error log. Fire-and-forget: logging must never
 * break a request, so failures only reach the console.
 */
export function logParseError(entry: ParseErrorEntry): void {
  const line =
    JSON.stringify({
      timestamp: new Date().toISOString(),
      model: config.openrouter.model,
      ...entry,
      raw: cap(entry.raw),
      emitted: cap(entry.emitted),
    }) + '\n';

  void (async () => {
    try {
      await mkdir(path.dirname(PARSE_ERROR_LOG_PATH), { recursive: true });
      await rotateIfNeeded();
      await appendFile(PARSE_ERROR_LOG_PATH, line, 'utf8');
    } catch (error) {
      console.error('Failed to write parse-error log:', error);
    }
  })();

  console.error(`[parse-error] ${entry.route} ${entry.stage}: ${entry.message}`);
}

/**
 * End-of-stream validation: did the model produce valid JSON, and did our
 * in-stream pinyin injection keep it valid? Logs at most one entry, blaming
 * the earliest broken stage.
 *
 * Returns the parsed raw output when available so callers can reuse it
 * (e.g. for grammar hydration) without a second JSON.parse.
 */
export function validateStreamOutput(options: {
  route: string;
  sentence: string;
  raw: string;
  emitted: string;
}): unknown | null {
  const { route, sentence, raw, emitted } = options;

  let parsedRaw: unknown | null = null;
  try {
    parsedRaw = JSON.parse(raw);
  } catch (error) {
    logParseError({
      route,
      stage: 'model-output',
      message: error instanceof Error ? error.message : 'Invalid JSON from model',
      sentence,
      raw,
    });
    return null;
  }

  try {
    JSON.parse(emitted);
  } catch (error) {
    logParseError({
      route,
      stage: 'pinyin-injection',
      message: error instanceof Error ? error.message : 'Emitted content is invalid JSON',
      sentence,
      raw,
      emitted,
    });
  }

  return parsedRaw;
}
