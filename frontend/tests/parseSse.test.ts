import { describe, expect, it, vi } from 'vitest';
import { parseSseResponse } from '@/lib/parseSse';
import type { ParseResponse } from '@/types';

function createDeltaLine(part: string): string {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: part } }] })}\n`;
}

function createSseResponse(lines: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      lines.forEach((line) => controller.enqueue(encoder.encode(line)));
      controller.close();
    },
  });

  return new Response(stream);
}

describe('parseSseResponse', () => {
  it('parses final JSON and emits partial updates', async () => {
    const final: ParseResponse = {
      translation: 'hello',
      segments: [],
      translationParts: [],
    };

    const finalJson = JSON.stringify(final);
    const chunkA = finalJson.slice(0, Math.floor(finalJson.length / 2));
    const chunkB = finalJson.slice(Math.floor(finalJson.length / 2));

    const onPartial = vi.fn();

    const response = createSseResponse([
      ': keepalive\n',
      'event: message\n',
      'data: this is malformed json\n',
      createDeltaLine(chunkA),
      createDeltaLine(chunkB),
      'data: [DONE]',
    ]);

    const result = await parseSseResponse(response, { onPartial });

    expect(result).toEqual(final);
    expect(onPartial).toHaveBeenCalled();
  });

  it('throws AbortError when aborted during read', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(createDeltaLine('{"translation":"hi"')));
      },
    });

    const response = new Response(stream);
    const controller = new AbortController();

    const parsingPromise = parseSseResponse(response, { signal: controller.signal });
    controller.abort();

    await expect(parsingPromise).rejects.toMatchObject({ name: 'AbortError' });
  });
});
