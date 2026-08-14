import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:fs/promises', () => ({
  appendFile: vi.fn(async () => undefined),
  mkdir: vi.fn(async () => undefined),
  rename: vi.fn(async () => undefined),
  stat: vi.fn(async () => ({ size: 0 })),
}));

import { appendFile } from 'node:fs/promises';
import { logParseError, validateStreamOutput } from '../src/services/parseErrorLog.js';

const appendFileMock = vi.mocked(appendFile);

function flushAsync(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

async function loggedEntries(): Promise<Array<Record<string, unknown>>> {
  await flushAsync();
  return appendFileMock.mock.calls.map(([, line]) => JSON.parse(line as string));
}

beforeEach(() => {
  appendFileMock.mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateStreamOutput', () => {
  it('returns the parsed output and logs nothing when both payloads are valid', async () => {
    const raw = '{"translation":"hi","segments":[]}';
    const emitted = '{"translation":"hi","segments":[]}';

    const parsed = validateStreamOutput({ route: 'parse2', sentence: '你好', raw, emitted });

    expect(parsed).toEqual({ translation: 'hi', segments: [] });
    expect(await loggedEntries()).toHaveLength(0);
  });

  it('logs stage model-output and returns null when the raw output is invalid', async () => {
    const parsed = validateStreamOutput({
      route: 'parse2',
      sentence: '你好',
      raw: '{"translation": "hi",,}',
      emitted: '{"translation": "hi"}',
    });

    expect(parsed).toBeNull();
    const entries = await loggedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      route: 'parse2',
      stage: 'model-output',
      sentence: '你好',
      raw: '{"translation": "hi",,}',
    });
  });

  it('logs stage pinyin-injection when raw is valid but emitted is not', async () => {
    const raw = '{"segments":[{"id":0,"token":"你"}]}';
    const emitted = '{"segments":[{"id":0,"token":"你","pinyin":}]}';

    const parsed = validateStreamOutput({ route: 'parse2', sentence: '你', raw, emitted });

    expect(parsed).toEqual({ segments: [{ id: 0, token: '你' }] });
    const entries = await loggedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      stage: 'pinyin-injection',
      raw,
      emitted,
    });
  });
});

describe('logParseError', () => {
  it('writes one NDJSON line with timestamp and model', async () => {
    logParseError({ route: 'parse-text', stage: 'stream', message: 'boom', sentence: '你好' });

    const entries = await loggedEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ route: 'parse-text', stage: 'stream', message: 'boom' });
    expect(typeof entries[0].timestamp).toBe('string');
    expect(appendFileMock.mock.calls[0][1]).toMatch(/\n$/);
  });

  it('caps oversized payloads', async () => {
    logParseError({
      route: 'parse2',
      stage: 'model-output',
      message: 'too big',
      raw: 'x'.repeat(30_000),
    });

    const entries = await loggedEntries();
    const raw = entries[0].raw as string;
    expect(raw.length).toBeLessThan(21_000);
    expect(raw).toContain('[truncated');
  });
});
