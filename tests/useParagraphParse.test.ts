import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useParagraphParse } from '@/hooks/useParagraphParse';
import { ApiError } from '@/lib/api';
import type { ParseInput, ParseResponse } from '@/types';

const { startParseMock, parseSseResponseMock } = vi.hoisted(() => ({
  startParseMock: vi.fn(),
  parseSseResponseMock: vi.fn(),
}));

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
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

const TEXT = '第一句。第二句。第三句。第四句。第五句。第六句。';

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useParagraphParse', () => {
  beforeEach(() => {
    startParseMock.mockReset();
    parseSseResponseMock.mockReset();

    startParseMock.mockResolvedValue({} as Response);
    parseSseResponseMock.mockResolvedValue(PARSE_RESULT);
  });

  it('prefetches only the first two sentences initially and auto-expands the first sentence', async () => {
    const { result } = renderHook(() => useParagraphParse());

    await act(async () => {
      await result.current.start(TEXT);
    });

    await waitFor(() => {
      expect(result.current.sentences.length).toBeGreaterThanOrEqual(5);
      expect(startParseMock).toHaveBeenCalledTimes(2);
    });

    const expectedFirstTwo = result.current.sentences.slice(0, 2).map((sentence) => sentence.text);
    const calledSentences = startParseMock.mock.calls.map(([input]: [ParseInput]) => input.sentence);

    expect(calledSentences).toEqual(expectedFirstTwo);
    expect(result.current.openSentenceIds).toEqual([result.current.sentences[0].id]);
  });

  it('when a user opens sentence N, it prefetches N+1 and N+2', async () => {
    const { result } = renderHook(() => useParagraphParse());

    await act(async () => {
      await result.current.start(TEXT);
    });

    await waitFor(() => {
      expect(result.current.sentences.length).toBeGreaterThanOrEqual(5);
      expect(startParseMock).toHaveBeenCalledTimes(2);
    });

    const thirdSentenceId = result.current.sentences[2].id;

    act(() => {
      result.current.selectSentence(thirdSentenceId);
    });

    await waitFor(() => {
      expect(startParseMock).toHaveBeenCalledTimes(5);
    });

    const expectedTexts = new Set(result.current.sentences.slice(0, 5).map((sentence) => sentence.text));
    const calledTexts = new Set(startParseMock.mock.calls.map(([input]: [ParseInput]) => input.sentence));

    expect(calledTexts).toEqual(expectedTexts);
  });

  it('streams partial sentence results before parse completion', async () => {
    const deferred = createDeferred<ParseResponse>();
    const partialResult: ParseResponse = {
      translation: 'partial translation',
      segments: [{ id: 0, token: '第一句', pinyin: 'di4 yi1 ju4', definition: 'first sentence' }],
      translationParts: [],
    };
    const finalResult: ParseResponse = {
      translation: 'final translation',
      segments: [{ id: 0, token: '第一句', pinyin: 'di4 yi1 ju4', definition: 'first sentence' }],
      translationParts: [{ text: 'final translation', segmentIds: [0] }],
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

    const { result } = renderHook(() => useParagraphParse());

    await act(async () => {
      await result.current.start(TEXT);
    });

    await waitFor(() => {
      expect(result.current.sentences.length).toBeGreaterThan(0);
    });

    const firstSentence = result.current.sentences.find((sentence) => sentence.text === '第一句。');
    expect(firstSentence).toBeDefined();

    await waitFor(() => {
      expect(result.current.sentenceResults[firstSentence!.id]?.translation).toBe('partial translation');
      expect(result.current.sentenceLoading[firstSentence!.id]).toBe(true);
    });

    await act(async () => {
      deferred.resolve(finalResult);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.sentenceResults[firstSentence!.id]?.translation).toBe('final translation');
      expect(result.current.sentenceLoading[firstSentence!.id]).toBe(false);
    });
  });

  it('does not send duplicate parse requests for the same sentence while in-flight', async () => {
    parseSseResponseMock.mockImplementation(
      () => new Promise<ParseResponse>((resolve) => setTimeout(() => resolve(PARSE_RESULT), 30))
    );

    const { result } = renderHook(() => useParagraphParse());

    await act(async () => {
      await result.current.start(TEXT);
    });

    await waitFor(() => {
      expect(result.current.sentences.length).toBeGreaterThanOrEqual(3);
      expect(startParseMock).toHaveBeenCalledTimes(2);
    });

    const targetSentenceId = result.current.sentences[2].id;
    const targetSentenceText = result.current.sentences[2].text;

    act(() => {
      result.current.selectSentence(targetSentenceId); // open
      result.current.selectSentence(targetSentenceId); // close
      result.current.selectSentence(targetSentenceId); // open again while likely in-flight
    });

    await waitFor(() => {
      const callsForTarget = startParseMock.mock.calls.filter(
        ([input]: [ParseInput]) => input.sentence === targetSentenceText
      );
      expect(callsForTarget).toHaveLength(1);
    });
  });

  it('aborts in-flight requests and clears state on reset', async () => {
    const signals: AbortSignal[] = [];

    startParseMock.mockImplementation((_: ParseInput, signal?: AbortSignal) => {
      if (!signal) {
        throw new Error('Expected an AbortSignal for parse request');
      }

      signals.push(signal);

      return new Promise<Response>((_, reject) => {
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

    const { result } = renderHook(() => useParagraphParse());

    await act(async () => {
      await result.current.start(TEXT);
    });

    await waitFor(() => {
      expect(startParseMock).toHaveBeenCalledTimes(2);
    });

    act(() => {
      result.current.reset();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(signals.length).toBe(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
    expect(result.current.sentences).toEqual([]);
    expect(result.current.sentenceResults).toEqual({});
    expect(result.current.sentenceLoading).toEqual({});
    expect(result.current.sentenceError).toEqual({});
    expect(result.current.error).toBeNull();
  });

  it('retries once on 429 before succeeding', async () => {
    let retrySentence: string | null = null;
    const attempts = new Map<string, number>();

    startParseMock.mockImplementation(async (input: ParseInput) => {
      const sentence = input.sentence;
      const nextAttempt = (attempts.get(sentence) ?? 0) + 1;
      attempts.set(sentence, nextAttempt);

      if (!retrySentence) {
        retrySentence = sentence;
      }

      if (sentence === retrySentence && nextAttempt === 1) {
        throw new ApiError('rate limited', 429, 1);
      }

      return {} as Response;
    });

    const { result } = renderHook(() => useParagraphParse());

    await act(async () => {
      await result.current.start(TEXT);
    });

    await waitFor(() => {
      expect(retrySentence).toBeTruthy();
      expect(attempts.get(retrySentence!)).toBe(2);
    });
  });
});
