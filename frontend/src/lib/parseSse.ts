import type { ParseResponse } from '@/types';

export async function parseSseResponse(response: Response): Promise<ParseResponse> {
  if (!response.body) {
    throw new Error('No response body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let contentBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const lineEnd = buffer.indexOf('\n');
      if (lineEnd === -1) break;

      const line = buffer.slice(0, lineEnd).trim();
      buffer = buffer.slice(lineEnd + 1);

      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed?.choices?.[0]?.delta?.content;
        if (delta) {
          contentBuffer += delta;
        }
      } catch {
        // Ignore malformed SSE chunks
      }
    }
  }

  if (!contentBuffer) {
    throw new Error('Empty response from parse');
  }

  return JSON.parse(contentBuffer) as ParseResponse;
}
