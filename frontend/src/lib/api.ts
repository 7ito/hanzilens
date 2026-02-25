/**
 * API client for HanziLens backend
 */

import type { LookupResponse, OcrResult, ParseInput } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/**
 * Look up a token in the dictionary
 */
export async function lookupDefinition(token: string): Promise<LookupResponse> {
  const response = await fetch(`${API_BASE_URL}/definitionLookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ token }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Start a parse request and return the response for streaming.
 * Accepts either text input or image input (base64 data URL).
 * The caller is responsible for reading the SSE stream.
 */
export async function startParse(input: ParseInput): Promise<Response> {
  const body = input.type === 'text' 
    ? { sentence: input.sentence, ...(input.context ? { context: input.context } : {}) }
    : { image: input.image };

  const response = await fetch(`${API_BASE_URL}/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response;
}

/**
 * Extract text lines + layout from an image.
 * Returns normalized bounding boxes for overlay rendering.
 */
export async function startOcr(image: string): Promise<OcrResult> {
  const response = await fetch(`${API_BASE_URL}/ocr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ image }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Check if text contains at least one Chinese character.
 */
export function hasChineseText(text: string): boolean {
  if (!text) return false;
  const chineseRegex = /[\u4e00-\u9fff]/;
  return chineseRegex.test(text);
}
