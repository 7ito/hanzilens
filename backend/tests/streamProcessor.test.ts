import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PinyinMap } from '../src/services/pinyinCorrection.js';

// Mock pinyinCorrection to isolate state machine logic
vi.mock('../src/services/pinyinCorrection.js', () => ({
  getPinyinFromMap: vi.fn(),
  findTokenPosition: vi.fn(),
}));

import {
  createStreamState,
  processStreamBuffer,
  extractDeltaContent,
  type StreamState,
} from '../src/services/streamProcessor.js';
import { getPinyinFromMap, findTokenPosition } from '../src/services/pinyinCorrection.js';

const mockFindTokenPosition = vi.mocked(findTokenPosition);
const mockGetPinyinFromMap = vi.mocked(getPinyinFromMap);

function makePinyinMap(sentence: string): PinyinMap {
  return { charPinyin: new Map(), sentence };
}

describe('createStreamState', () => {
  it('returns correct initial state', () => {
    const state = createStreamState();
    expect(state).toEqual({
      buffer: '',
      inSegmentsArray: false,
      currentToken: null,
      sentencePosition: 0,
      capturingPinyin: false,
      capturedPinyin: '',
    });
  });
});

describe('extractDeltaContent', () => {
  it('extracts content from valid SSE data line', () => {
    const line = 'data: {"choices":[{"delta":{"content":"hello"}}]}';
    expect(extractDeltaContent(line)).toBe('hello');
  });

  it('returns null for non-data lines', () => {
    expect(extractDeltaContent(': keepalive')).toBeNull();
    expect(extractDeltaContent('event: message')).toBeNull();
    expect(extractDeltaContent('')).toBeNull();
  });

  it('returns null for [DONE]', () => {
    expect(extractDeltaContent('data: [DONE]')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(extractDeltaContent('data: {not valid json')).toBeNull();
  });

  it('returns null for missing delta content', () => {
    expect(extractDeltaContent('data: {"choices":[]}')).toBeNull();
    expect(extractDeltaContent('data: {"choices":[{"delta":{}}]}')).toBeNull();
  });

  it('returns non-string content as-is (uses ?? null, not type check)', () => {
    // The code uses `?? null` which only filters null/undefined
    // A number content is returned as-is (edge case in the real API)
    expect(extractDeltaContent('data: {"choices":[{"delta":{"content":123}}]}')).toBe(123);
  });
});

describe('processStreamBuffer', () => {
  beforeEach(() => {
    mockFindTokenPosition.mockReset();
    mockGetPinyinFromMap.mockReset();
  });

  it('passes through content before "segments" array', () => {
    const state: StreamState = {
      ...createStreamState(),
      buffer: '{"translation": "hello", ',
    };
    const pinyinMap = makePinyinMap('你好');

    const result = processStreamBuffer(state, pinyinMap);

    // The buffer is short (< 50 chars) so it's retained for pattern matching
    expect(result.state.inSegmentsArray).toBe(false);
  });

  it('detects "segments": [ and transitions to inSegmentsArray', () => {
    const json = '{"translation": "hello", "segments": [';
    const state: StreamState = {
      ...createStreamState(),
      buffer: json,
    };
    const pinyinMap = makePinyinMap('你好');

    const result = processStreamBuffer(state, pinyinMap);

    expect(result.toEmit).toContain('"segments": [');
    expect(result.state.inSegmentsArray).toBe(true);
  });

  it('captures token value inside segments array', () => {
    const state: StreamState = {
      ...createStreamState(),
      buffer: '{"id": 0, "token": "你好", "pinyin": "ni3 hao3", "definition": "hello"}',
      inSegmentsArray: true,
    };
    const pinyinMap = makePinyinMap('你好');
    mockFindTokenPosition.mockReturnValue(0);
    mockGetPinyinFromMap.mockReturnValue('ni3 hao3');

    const result = processStreamBuffer(state, pinyinMap);

    expect(result.toEmit).toContain('"token": "你好"');
  });

  it('replaces pinyin value with corrected version', () => {
    const state: StreamState = {
      ...createStreamState(),
      buffer: '{"id": 0, "token": "朋友", "pinyin": "peng2 you3", "definition": "friend"}',
      inSegmentsArray: true,
    };
    const pinyinMap = makePinyinMap('朋友');
    mockFindTokenPosition.mockReturnValue(0);
    mockGetPinyinFromMap.mockReturnValue('peng2 you5');

    const result = processStreamBuffer(state, pinyinMap);

    // Should contain the corrected pinyin, not the original
    expect(result.toEmit).toContain('peng2 you5');
    expect(result.toEmit).not.toContain('peng2 you3');
  });

  it('handles multiple segments sequentially', () => {
    const json =
      '{"id": 0, "token": "你", "pinyin": "ni3", "definition": "you"}, ' +
      '{"id": 1, "token": "好", "pinyin": "hao3", "definition": "good"}';

    const state: StreamState = {
      ...createStreamState(),
      buffer: json,
      inSegmentsArray: true,
    };
    const pinyinMap = makePinyinMap('你好');
    mockFindTokenPosition.mockReturnValueOnce(0).mockReturnValueOnce(1);
    mockGetPinyinFromMap.mockReturnValueOnce('ni3').mockReturnValueOnce('hao3');

    const result = processStreamBuffer(state, pinyinMap);

    expect(result.toEmit).toContain('"token": "你"');
    expect(result.toEmit).toContain('"token": "好"');
    expect(result.state.sentencePosition).toBe(2);
  });

  it('detects end of segments array and exits segment mode', () => {
    const state: StreamState = {
      ...createStreamState(),
      buffer: '], "translationParts": []',
      inSegmentsArray: true,
    };
    const pinyinMap = makePinyinMap('你好');

    const result = processStreamBuffer(state, pinyinMap);

    expect(result.state.inSegmentsArray).toBe(false);
  });

  it('retains up to 50-char buffer for partial pattern matching', () => {
    // Buffer content that doesn't match any pattern - last 50 chars should be retained
    const longContent = 'a'.repeat(100);
    const state: StreamState = {
      ...createStreamState(),
      buffer: longContent,
    };
    const pinyinMap = makePinyinMap('');

    const result = processStreamBuffer(state, pinyinMap);

    expect(result.state.buffer.length).toBe(50);
    expect(result.toEmit.length).toBe(50);
  });

  it('handles pinyin split across chunks (incomplete closing quote)', () => {
    // First chunk: pinyin value starts but doesn't end
    const state: StreamState = {
      ...createStreamState(),
      buffer: 'ni3 hao',
      inSegmentsArray: true,
      currentToken: '你好',
      capturingPinyin: true,
      capturedPinyin: '',
    };
    const pinyinMap = makePinyinMap('你好');

    const result = processStreamBuffer(state, pinyinMap);

    // Should still be capturing - no closing quote found
    expect(result.state.capturingPinyin).toBe(true);
    expect(result.state.buffer).toBe('ni3 hao');
  });

  it('completes pinyin capture when closing quote arrives', () => {
    // Second chunk: closing quote arrives
    const state: StreamState = {
      ...createStreamState(),
      buffer: 'ni3 hao3"',
      inSegmentsArray: true,
      currentToken: '你好',
      capturingPinyin: true,
      capturedPinyin: '',
    };
    const pinyinMap = makePinyinMap('你好');
    mockFindTokenPosition.mockReturnValue(0);
    mockGetPinyinFromMap.mockReturnValue('ni3 hao3');

    const result = processStreamBuffer(state, pinyinMap);

    expect(result.state.capturingPinyin).toBe(false);
    expect(result.state.currentToken).toBeNull();
    expect(result.toEmit).toContain('ni3 hao3"');
  });

  it('ignores "pinyin" key if no current token captured', () => {
    const state: StreamState = {
      ...createStreamState(),
      buffer: '"pinyin": "ni3"',
      inSegmentsArray: true,
      currentToken: null, // No token captured yet
    };
    const pinyinMap = makePinyinMap('你');

    const result = processStreamBuffer(state, pinyinMap);

    // Should NOT enter capturing state since currentToken is null
    expect(result.state.capturingPinyin).toBe(false);
    expect(mockGetPinyinFromMap).not.toHaveBeenCalled();
  });

  it('falls back to original pinyin when correction returns empty', () => {
    const state: StreamState = {
      ...createStreamState(),
      buffer: '{"id": 0, "token": "ABC", "pinyin": "ABC", "definition": ""}',
      inSegmentsArray: true,
    };
    const pinyinMap = makePinyinMap('ABC你好');
    mockFindTokenPosition.mockReturnValue(0);
    mockGetPinyinFromMap.mockReturnValue(''); // Empty correction

    const result = processStreamBuffer(state, pinyinMap);

    // Should keep the original "ABC" pinyin since correction returned empty
    expect(result.toEmit).toContain('ABC"');
  });

  it('falls back to original pinyin when token not found in sentence', () => {
    const state: StreamState = {
      ...createStreamState(),
      buffer: '{"id": 0, "token": "你好", "pinyin": "original", "definition": "hi"}',
      inSegmentsArray: true,
    };
    const pinyinMap = makePinyinMap('别的句子');
    mockFindTokenPosition.mockReturnValue(-1); // Not found

    const result = processStreamBuffer(state, pinyinMap);

    // Should keep original pinyin since token wasn't found in sentence
    expect(result.toEmit).toContain('original"');
    expect(mockGetPinyinFromMap).not.toHaveBeenCalled();
  });

  it('handles complete JSON in a single chunk', () => {
    const json =
      '{"translation": "hello", "segments": [' +
      '{"id": 0, "token": "你好", "pinyin": "ni3 hao3", "definition": "hello"}' +
      '], "translationParts": []}';

    const state: StreamState = {
      ...createStreamState(),
      buffer: json,
    };
    const pinyinMap = makePinyinMap('你好');
    mockFindTokenPosition.mockReturnValue(0);
    mockGetPinyinFromMap.mockReturnValue('ni3 hao3');

    const result = processStreamBuffer(state, pinyinMap);

    expect(result.toEmit).toContain('"translation": "hello"');
    expect(result.toEmit).toContain('"segments": [');
    expect(result.toEmit).toContain('"token": "你好"');
    expect(result.state.inSegmentsArray).toBe(false);
  });

  it('advances sentencePosition after each token', () => {
    const json =
      '{"id": 0, "token": "你", "pinyin": "ni3", "definition": "you"}, ' +
      '{"id": 1, "token": "好", "pinyin": "hao3", "definition": "good"}';

    const state: StreamState = {
      ...createStreamState(),
      buffer: json,
      inSegmentsArray: true,
    };
    const pinyinMap = makePinyinMap('你好');

    // First token at position 0, second at position 1
    mockFindTokenPosition.mockReturnValueOnce(0).mockReturnValueOnce(1);
    mockGetPinyinFromMap.mockReturnValue('corrected');

    const result = processStreamBuffer(state, pinyinMap);

    // findTokenPosition should be called with increasing searchFrom
    expect(mockFindTokenPosition).toHaveBeenNthCalledWith(1, '你好', '你', 0);
    expect(mockFindTokenPosition).toHaveBeenNthCalledWith(2, '你好', '好', 1);
  });
});
