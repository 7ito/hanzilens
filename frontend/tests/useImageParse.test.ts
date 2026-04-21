import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useImageParse } from '@/hooks/useImageParse';
import type { OcrResult, ParseInput, ParseResponse } from '@/types';

const { startOcrMock, startParseMock, parseSseResponseMock } = vi.hoisted(() => ({
  startOcrMock: vi.fn(),
  startParseMock: vi.fn(),
  parseSseResponseMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    startOcr: startOcrMock,
    startParse: startParseMock,
  };
});

vi.mock('@/lib/parseSse', () => ({
  parseSseResponse: parseSseResponseMock,
}));

const PARSE_RESULT: ParseResponse = {
  translation: 'ok',
  segments: [],
  translationParts: [],
};

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function buildOcrResult(): OcrResult {
  const sourceLines = ['第一句。', '第二句。', '第三句。', '第四句。', '第五句。', '第六句。'];
  const text = sourceLines.join('\n');
  let cursor = 0;

  const lines = sourceLines.map((lineText, index) => {
    const startOffset = cursor;
    const endOffset = startOffset + lineText.length;
    cursor = endOffset + 1;

    return {
      id: `line-${index + 1}`,
      text: lineText,
      startOffset,
      endOffset,
      box: { x: 0.1, y: 0.1 + index * 0.1, w: 0.8, h: 0.08 },
      wordIds: [`word-${index + 1}`],
    };
  });

  const words = lines.map((line, index) => ({
    id: `word-${index + 1}`,
    text: line.text,
    startOffset: line.startOffset,
    endOffset: line.endOffset,
    lineId: line.id,
    box: line.box,
  }));

  return {
    imageSize: { width: 1000, height: 1000 },
    text,
    readingDirection: 'horizontal',
    lines,
    words,
  };
}

describe('useImageParse', () => {
  beforeEach(() => {
    startOcrMock.mockReset();
    startParseMock.mockReset();
    parseSseResponseMock.mockReset();

    startOcrMock.mockResolvedValue(buildOcrResult());
    startParseMock.mockResolvedValue({} as Response);
    parseSseResponseMock.mockResolvedValue(PARSE_RESULT);
  });

  it('prefetches first two sentences, auto-expands the first sentence, then prefetches next two after user opens one', async () => {
    const { result } = renderHook(() => useImageParse());

    await act(async () => {
      await result.current.start('data:image/png;base64,abc');
    });

    await waitFor(() => {
      expect(result.current.sentences.length).toBeGreaterThanOrEqual(5);
      expect(startParseMock).toHaveBeenCalledTimes(2);
    });

    expect(result.current.openSentenceIds).toEqual([result.current.sentences[0].id]);

    const thirdSentenceId = result.current.sentences[2].id;
    act(() => {
      result.current.selectSentence(thirdSentenceId);
    });

    await waitFor(() => {
      expect(startParseMock).toHaveBeenCalledTimes(5);
    });
  });

  it('aborts OCR request when reset is called', async () => {
    const capturedSignals: AbortSignal[] = [];

    startOcrMock.mockImplementation((_: string, signal?: AbortSignal) => {
      if (!signal) {
        throw new Error('Expected an AbortSignal for OCR request');
      }

      capturedSignals.push(signal);

      return new Promise<OcrResult>((_, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            const abortError = new Error('aborted');
            abortError.name = 'AbortError';
            reject(abortError);
          },
          { once: true }
        );
      });
    });

    const { result } = renderHook(() => useImageParse());

    act(() => {
      void result.current.start('data:image/png;base64,abc');
    });

    await waitFor(() => {
      expect(startOcrMock).toHaveBeenCalledTimes(1);
    });

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(capturedSignals).toHaveLength(1);
    expect(capturedSignals[0].aborted).toBe(true);
    expect(result.current.ocrResult).toBeNull();
    expect(result.current.sentences).toEqual([]);
    expect(result.current.sentenceResults).toEqual({});
    expect(result.current.isLoadingOcr).toBe(false);
  });

  it('streams partial sentence results in image mode before completion', async () => {
    const deferred = createDeferred<ParseResponse>();
    const partialResult: ParseResponse = {
      translation: 'partial image translation',
      segments: [{ id: 0, token: '第一句', pinyin: 'di4 yi1 ju4', definition: 'first sentence' }],
      translationParts: [],
    };
    const finalResult: ParseResponse = {
      translation: 'final image translation',
      segments: [{ id: 0, token: '第一句', pinyin: 'di4 yi1 ju4', definition: 'first sentence' }],
      translationParts: [{ text: 'final image translation', segmentIds: [0] }],
    };

    startParseMock.mockImplementation(async (input: ParseInput) => {
      return { sentence: input.sentence } as unknown as Response;
    });

    parseSseResponseMock.mockImplementation(
      (response: Response, options?: { onPartial?: (partial: unknown) => void }) => {
        const sentence = (response as unknown as { sentence?: string }).sentence;
        if (sentence === '第一句。') {
          options?.onPartial?.(partialResult);
          return deferred.promise;
        }

        return Promise.resolve(PARSE_RESULT);
      }
    );

    const { result } = renderHook(() => useImageParse());

    await act(async () => {
      await result.current.start('data:image/png;base64,abc');
    });

    await waitFor(() => {
      expect(result.current.sentences.length).toBeGreaterThan(0);
    });

    const firstSentence = result.current.sentences.find((sentence) => sentence.text === '第一句。');
    expect(firstSentence).toBeDefined();

    await waitFor(() => {
      expect(result.current.sentenceResults[firstSentence!.id]?.translation).toBe('partial image translation');
      expect(result.current.sentenceLoading[firstSentence!.id]).toBe(true);
    });

    await act(async () => {
      deferred.resolve(finalResult);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.sentenceResults[firstSentence!.id]?.translation).toBe('final image translation');
      expect(result.current.sentenceLoading[firstSentence!.id]).toBe(false);
    });
  });

  it('does not duplicate parse calls for repeated sentence open while loading', async () => {
    parseSseResponseMock.mockImplementation(
      () => new Promise<ParseResponse>((resolve) => setTimeout(() => resolve(PARSE_RESULT), 30))
    );

    const { result } = renderHook(() => useImageParse());

    await act(async () => {
      await result.current.start('data:image/png;base64,abc');
    });

    await waitFor(() => {
      expect(result.current.sentences.length).toBeGreaterThanOrEqual(3);
      expect(startParseMock).toHaveBeenCalledTimes(2);
    });

    const targetSentenceId = result.current.sentences[2].id;
    const targetSentenceText = result.current.sentences[2].text;

    act(() => {
      result.current.selectSentence(targetSentenceId);
      result.current.selectSentence(targetSentenceId);
      result.current.selectSentence(targetSentenceId);
    });

    await waitFor(() => {
      const callsForTarget = startParseMock.mock.calls.filter(
        ([input]: [ParseInput]) => input.sentence === targetSentenceText
      );
      expect(callsForTarget).toHaveLength(1);
    });
  });
});
