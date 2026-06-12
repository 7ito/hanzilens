import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PinyinMap } from '../src/services/pinyinCorrection.js';

// Mock pinyinCorrection to isolate state machine logic
vi.mock('../src/services/pinyinCorrection.js', () => ({
  getPinyinFromMap: vi.fn(),
  findTokenPosition: vi.fn(),
}));

import {
  createStreamStateV2,
  processStreamBufferV2,
  type StreamStateV2,
} from '../src/services/streamProcessorV2.js';
import { getPinyinFromMap, findTokenPosition } from '../src/services/pinyinCorrection.js';

const mockFindTokenPosition = vi.mocked(findTokenPosition);
const mockGetPinyinFromMap = vi.mocked(getPinyinFromMap);

function makePinyinMap(sentence: string): PinyinMap {
  return { charPinyin: new Map(), sentence };
}

/**
 * Feed content through the processor in chunks and return the full emitted output.
 */
function processChunks(chunks: string[], pinyinMap: PinyinMap): string {
  let state = createStreamStateV2();
  let emitted = '';
  for (const chunk of chunks) {
    state.buffer += chunk;
    const result = processStreamBufferV2(state, pinyinMap);
    state = result.state;
    emitted += result.toEmit;
  }
  // Final flush (mirrors what the route does at end of stream)
  emitted += state.buffer;
  return emitted;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindTokenPosition.mockImplementation((sentence, token, from) => sentence.indexOf(token, from));
  mockGetPinyinFromMap.mockImplementation((_map, token) => {
    const table: Record<string, string> = {
      '你': 'ni3',
      '好': 'hao3',
      '你好': 'ni3 hao3',
      '吗': 'ma5',
    };
    return table[token] ?? '';
  });
});

describe('createStreamStateV2', () => {
  it('returns correct initial state', () => {
    expect(createStreamStateV2()).toEqual({
      buffer: '',
      inSegmentsArray: false,
      sentencePosition: 0,
      lastCorrectedPinyin: null,
      capturingPinyin: false,
    });
  });
});

describe('processStreamBufferV2', () => {
  it('injects pinyin after each token in the segments array', () => {
    const pinyinMap = makePinyinMap('你好吗？');
    const input = '{"translation":"Hello?","segments":[{"id":0,"token":"你好","definition":"hello"},{"id":1,"token":"吗","definition":"(question)"},{"id":2,"token":"？","definition":""}],"translationParts":[]}';

    const output = processChunks([input], pinyinMap);
    const parsed = JSON.parse(output);

    expect(parsed.segments).toEqual([
      { id: 0, token: '你好', pinyin: 'ni3 hao3', definition: 'hello' },
      { id: 1, token: '吗', pinyin: 'ma5', definition: '(question)' },
      { id: 2, token: '？', pinyin: '', definition: '' },
    ]);
    // Untouched parts pass through
    expect(parsed.translation).toBe('Hello?');
  });

  it('produces identical output regardless of chunk boundaries', () => {
    const pinyinMap = makePinyinMap('你好吗？');
    const input = '{"translation":"Hi","segments":[{"id":0,"token":"你好","definition":"hello"},{"id":1,"token":"吗","definition":"q"}],"translationParts":[]}';

    const wholeOutput = processChunks([input], pinyinMap);

    // Split into 3-char chunks to force pattern splits across boundaries
    const tinyChunks: string[] = [];
    for (let i = 0; i < input.length; i += 3) {
      tinyChunks.push(input.slice(i, i + 3));
    }
    const chunkedOutput = processChunks(tinyChunks, pinyinMap);

    expect(chunkedOutput).toBe(wholeOutput);
    expect(JSON.parse(chunkedOutput).segments[0].pinyin).toBe('ni3 hao3');
  });

  it('tracks sentence position for repeated tokens', () => {
    const pinyinMap = makePinyinMap('你你');
    const input = '"segments":[{"id":0,"token":"你","definition":"a"},{"id":1,"token":"你","definition":"b"}]';

    processChunks([input], pinyinMap);

    expect(mockFindTokenPosition).toHaveBeenNthCalledWith(1, '你你', '你', 0);
    expect(mockFindTokenPosition).toHaveBeenNthCalledWith(2, '你你', '你', 1);
  });

  it('injects empty pinyin when the token is not found in the sentence', () => {
    const pinyinMap = makePinyinMap('你好');
    mockFindTokenPosition.mockReturnValue(-1);
    const input = '"segments":[{"id":0,"token":"啊","definition":"x"}]';

    const output = processChunks([input], pinyinMap);

    expect(output).toContain('"token":"啊","pinyin":""');
    expect(mockGetPinyinFromMap).not.toHaveBeenCalled();
  });

  it('replaces a stray model-emitted pinyin value with the corrected pinyin', () => {
    const pinyinMap = makePinyinMap('你好');
    const input = '"segments":[{"id":0,"token":"你好","pinyin":"wrong1 wrong2","definition":"hello"}]';

    const output = processChunks([input], pinyinMap);

    // Injected after token AND the stray field corrected — duplicate keys agree
    expect(output).toContain('"token":"你好","pinyin":"ni3 hao3"');
    expect(output).toContain('"pinyin":"ni3 hao3","definition"');
    expect(output).not.toContain('wrong1');
  });

  it('handles a stray pinyin value split across chunks', () => {
    const pinyinMap = makePinyinMap('你好');
    const chunks = [
      '"segments":[{"id":0,"token":"你好","pinyin":"wro',
      'ng1","definition":"hello"}]',
    ];

    const output = processChunks(chunks, pinyinMap);

    expect(output).not.toContain('wrong1');
    expect(output).toContain('"pinyin":"ni3 hao3","definition"');
  });

  it('does not inject pinyin for token-like keys outside the segments array', () => {
    const pinyinMap = makePinyinMap('你好');
    const input = '{"translation":"x","segments":[],"translationParts":[{"text":"token","segmentIds":[]}],"grammarPoints":[]}';

    const output = processChunks([input], pinyinMap);

    expect(output).toBe(input);
    expect(mockGetPinyinFromMap).not.toHaveBeenCalled();
  });

  it('passes grammarPoints through untouched', () => {
    const pinyinMap = makePinyinMap('你好吗');
    const input = '{"translation":"x","segments":[{"id":0,"token":"你好","definition":"hi"}],"translationParts":[],"grammarPoints":[{"patternId":"a-not-a","segmentIds":[0]}]}';

    const output = processChunks([input], pinyinMap);
    const parsed = JSON.parse(output);

    expect(parsed.grammarPoints).toEqual([{ patternId: 'a-not-a', segmentIds: [0] }]);
  });
});
