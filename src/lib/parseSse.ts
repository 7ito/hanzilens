import { IncompleteJsonParser } from 'incomplete-json-parser';
import { createAbortError } from '@/lib/abort';
import { validateParseResponse, isValidPartialResponse } from '@/lib/validation';
import type { ParseResponse } from '@/types';

interface ParseSseOptions {
  signal?: AbortSignal;
  onPartial?: (partial: unknown) => void;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

function extractDeltaContent(dataLine: string): string | null {
  const trimmed = dataLine.trim();
  if (!trimmed.startsWith('data:')) {
    return null;
  }

  const data = trimmed.slice(5).trimStart();
  if (!data || data === '[DONE]') {
    return null;
  }

  try {
    const parsed = JSON.parse(data);
    const delta = parsed?.choices?.[0]?.delta?.content;
    return typeof delta === 'string' ? delta : null;
  } catch {
    return null;
  }
}

function emitPartial(contentBuffer: string, onPartial?: (partial: unknown) => void): void {
  if (!onPartial || !contentBuffer) return;

  try {
    const partial = IncompleteJsonParser.parse(contentBuffer);
    if (partial && typeof partial === 'object' && isValidPartialResponse(partial)) {
      onPartial(partial);
    }
  } catch {
    // Ignore incomplete JSON parse failures during streaming
  }
}

export async function parseSseResponse(response: Response, options: ParseSseOptions = {}): Promise<ParseResponse> {
  const { signal, onPartial } = options;

  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let contentBuffer = '';

  const processLine = (line: string) => {
    const delta = extractDeltaContent(line);
    if (!delta) return;

    contentBuffer += delta;
    emitPartial(contentBuffer, onPartial);
  };

  try {
    while (true) {
      throwIfAborted(signal);

      const { done, value } = await reader.read();
      throwIfAborted(signal);

      if (done) {
        buffer += decoder.decode();
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      while (true) {
        const lineEnd = buffer.indexOf('\n');
        if (lineEnd === -1) break;

        const line = buffer.slice(0, lineEnd).replace(/\r$/, '');
        buffer = buffer.slice(lineEnd + 1);
        processLine(line);
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw createAbortError();
    }
    throw error;
  } finally {
    reader.releaseLock();
  }

  if (buffer.trim()) {
    processLine(buffer);
  }

  if (!contentBuffer) {
    throw new Error('Empty response from parse');
  }

  let rawResult: unknown;
  try {
    rawResult = JSON.parse(contentBuffer);
  } catch {
    throw new Error('Invalid response from parse');
  }

  const validated = validateParseResponse(rawResult);
  if (!validated) {
    console.error('Parse response validation failed:', rawResult);
    throw new Error('Invalid response format from parse');
  }

  return validated;
}
