/**
 * API client for HanziLens backend
 */

import { hasChinese } from '@/lib/chinese';
import type { LookupResponse, OcrResult, ParseInput } from '@/types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const CLIENT_ID_STORAGE_KEY = 'hanzilens-client-id';

function getClientId(): string {
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing) return existing;

    const next = crypto.randomUUID();
    window.localStorage.setItem(CLIENT_ID_STORAGE_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

export type ApiFeature =
  | 'web_text_parse'
  | 'web_paragraph_sentence_parse'
  | 'web_image_ocr'
  | 'web_image_parse'
  | 'web_image_sentence_parse'
  | 'web_lookup';

function getClientHeaders(feature: ApiFeature): Record<string, string> {
  return {
    'X-HanziLens-Client': 'web',
    'X-HanziLens-Client-Id': getClientId(),
    'X-HanziLens-Client-Version': 'web',
    'X-HanziLens-Feature': feature,
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(message: string, status: number, retryAfterMs?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfterMs(headerValue: string | null): number | undefined {
  if (!headerValue) return undefined;

  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }

  const dateMs = Date.parse(headerValue);
  if (Number.isNaN(dateMs)) return undefined;

  const delta = dateMs - Date.now();
  return delta > 0 ? delta : undefined;
}

async function toApiError(response: Response): Promise<ApiError> {
  const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));

  let message = `HTTP ${response.status}`;

  const contentType = response.headers.get('Content-Type') || '';
  if (contentType.includes('application/json')) {
    const error = await response.json().catch(() => null);
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      message = error.message;
    }
  } else {
    const text = await response.text().catch(() => '');
    if (text.trim()) {
      message = text.trim();
    }
  }

  return new ApiError(message, response.status, retryAfterMs);
}

/**
 * Look up a token in the dictionary
 */
export async function lookupDefinition(token: string, signal?: AbortSignal): Promise<LookupResponse> {
  const response = await fetch(`${API_BASE_URL}/definitionLookup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getClientHeaders('web_lookup'),
    },
    body: JSON.stringify({ token }),
    signal,
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json();
}

/**
 * Start a parse request and return the response for streaming.
 * Accepts either text input or image input (base64 data URL).
 * The caller is responsible for reading the SSE stream.
 */
export async function startParse(
  input: ParseInput,
  signal?: AbortSignal,
  feature: ApiFeature = input.type === 'text' ? 'web_text_parse' : 'web_image_parse'
): Promise<Response> {
  const body = input.type === 'text' 
    ? { sentence: input.sentence, ...(input.context ? { context: input.context } : {}) }
    : { image: input.image };

  const response = await fetch(`${API_BASE_URL}/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getClientHeaders(feature),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response;
}

/**
 * Extract text lines + layout from an image.
 * Returns normalized bounding boxes for overlay rendering.
 */
export async function startOcr(image: string, signal?: AbortSignal): Promise<OcrResult> {
  const response = await fetch(`${API_BASE_URL}/ocr`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getClientHeaders('web_image_ocr'),
    },
    body: JSON.stringify({ image }),
    signal,
  });

  if (!response.ok) {
    throw await toApiError(response);
  }

  return response.json();
}

/**
 * Check if text contains at least one Chinese character.
 */
export function hasChineseText(text: string): boolean {
  if (!text) return false;
  return hasChinese(text);
}
