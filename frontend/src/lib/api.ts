/**
 * API client for HanziLens backend
 */

import type { LookupResponse } from '@/types';

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
 * Start a parse request and return the response for streaming
 * The caller is responsible for reading the SSE stream
 */
export async function startParse(sentence: string): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}/parse`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ sentence }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Unknown error' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response;
}

/**
 * Check if text has sufficient Chinese characters (at least 25%)
 */
export function hasChineseText(text: string, threshold = 0.25): boolean {
  if (!text || text.length < 2) return false;

  const chineseRegex = /[\u4e00-\u9fff]/g;
  const chineseMatches = text.match(chineseRegex) || [];
  const ratio = chineseMatches.length / text.length;

  return ratio >= threshold;
}
