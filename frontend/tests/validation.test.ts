import { describe, it, expect } from 'vitest';
import { validateParseResponse, isValidPartialResponse } from '@/lib/validation';

describe('validateParseResponse', () => {
  const validResponse = {
    translation: 'hello',
    segments: [{ id: 0, token: '你好', pinyin: 'ni3 hao3', definition: 'hello' }],
    translationParts: [{ text: 'hello', segmentIds: [0] }],
  };

  it('returns valid response for correct shape', () => {
    const result = validateParseResponse(validResponse);
    expect(result).toEqual(validResponse);
  });

  it('returns null for null', () => {
    expect(validateParseResponse(null)).toBeNull();
  });

  it('returns null for undefined', () => {
    expect(validateParseResponse(undefined)).toBeNull();
  });

  it('returns null for primitives', () => {
    expect(validateParseResponse('string')).toBeNull();
    expect(validateParseResponse(123)).toBeNull();
    expect(validateParseResponse(true)).toBeNull();
  });

  it('returns null for arrays', () => {
    expect(validateParseResponse([])).toBeNull();
    expect(validateParseResponse([validResponse])).toBeNull();
  });

  it('returns null for missing translation', () => {
    const { translation, ...rest } = validResponse;
    expect(validateParseResponse(rest)).toBeNull();
  });

  it('returns null for translation not a string', () => {
    expect(validateParseResponse({ ...validResponse, translation: 123 })).toBeNull();
  });

  it('returns null for missing segments', () => {
    const { segments, ...rest } = validResponse;
    expect(validateParseResponse(rest)).toBeNull();
  });

  it('returns null for segments not an array', () => {
    expect(validateParseResponse({ ...validResponse, segments: 'not array' })).toBeNull();
  });

  it('returns null for missing translationParts', () => {
    const { translationParts, ...rest } = validResponse;
    expect(validateParseResponse(rest)).toBeNull();
  });

  it('returns null for translationParts not an array', () => {
    expect(validateParseResponse({ ...validResponse, translationParts: {} })).toBeNull();
  });

  it('returns null for segment with wrong type for id', () => {
    expect(
      validateParseResponse({
        ...validResponse,
        segments: [{ id: 'not a number', token: '你', pinyin: 'ni3', definition: 'you' }],
      })
    ).toBeNull();
  });

  it('returns null for segment with wrong type for token', () => {
    expect(
      validateParseResponse({
        ...validResponse,
        segments: [{ id: 0, token: 123, pinyin: 'ni3', definition: 'you' }],
      })
    ).toBeNull();
  });

  it('returns null for segment with missing required field', () => {
    expect(
      validateParseResponse({
        ...validResponse,
        segments: [{ id: 0, token: '你' }], // missing pinyin and definition
      })
    ).toBeNull();
  });

  it('returns null for translationPart with segmentIds not an array', () => {
    expect(
      validateParseResponse({
        ...validResponse,
        translationParts: [{ text: 'hello', segmentIds: 'not array' }],
      })
    ).toBeNull();
  });

  it('returns null for translationPart with segmentIds containing non-numbers', () => {
    expect(
      validateParseResponse({
        ...validResponse,
        translationParts: [{ text: 'hello', segmentIds: ['a'] }],
      })
    ).toBeNull();
  });

  it('passes with extra fields on segments', () => {
    const response = {
      ...validResponse,
      segments: [
        { id: 0, token: '你', pinyin: 'ni3', definition: 'you', extraField: true },
      ],
    };
    expect(validateParseResponse(response)).not.toBeNull();
  });

  it('passes with empty segments and translationParts arrays', () => {
    const response = {
      translation: 'empty',
      segments: [],
      translationParts: [],
    };
    expect(validateParseResponse(response)).toEqual(response);
  });
});

describe('isValidPartialResponse', () => {
  it('returns true for empty object', () => {
    expect(isValidPartialResponse({})).toBe(true);
  });

  it('returns false for null', () => {
    expect(isValidPartialResponse(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidPartialResponse(undefined)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isValidPartialResponse([])).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isValidPartialResponse('string')).toBe(false);
    expect(isValidPartialResponse(123)).toBe(false);
  });

  it('returns true for partial with only translation string', () => {
    expect(isValidPartialResponse({ translation: 'hello' })).toBe(true);
  });

  it('returns false for translation as number', () => {
    expect(isValidPartialResponse({ translation: 123 })).toBe(false);
  });

  it('returns true for partial with valid segments array', () => {
    expect(
      isValidPartialResponse({
        segments: [{ id: 0, token: '你', pinyin: 'ni3', definition: 'you' }],
      })
    ).toBe(true);
  });

  it('returns false for segments not an array', () => {
    expect(isValidPartialResponse({ segments: 'not array' })).toBe(false);
  });

  it('returns true for segment with some fields missing (incomplete streaming)', () => {
    // During streaming, a segment object may be incomplete (e.g., only id parsed so far)
    expect(isValidPartialResponse({ segments: [{ id: 0 }] })).toBe(true);
    expect(isValidPartialResponse({ segments: [{}] })).toBe(true);
  });

  it('returns false for segment with wrong type for existing field', () => {
    expect(
      isValidPartialResponse({ segments: [{ id: 'not a number' }] })
    ).toBe(false);
    expect(
      isValidPartialResponse({ segments: [{ token: 123 }] })
    ).toBe(false);
    expect(
      isValidPartialResponse({ segments: [{ pinyin: false }] })
    ).toBe(false);
    expect(
      isValidPartialResponse({ segments: [{ definition: [] }] })
    ).toBe(false);
  });

  it('returns false for segment that is not an object', () => {
    expect(isValidPartialResponse({ segments: ['string'] })).toBe(false);
    expect(isValidPartialResponse({ segments: [null] })).toBe(false);
  });

  it('returns true for partial with valid translationParts', () => {
    expect(
      isValidPartialResponse({
        translationParts: [{ text: 'hello', segmentIds: [0] }],
      })
    ).toBe(true);
  });

  it('returns false for translationParts not an array', () => {
    expect(isValidPartialResponse({ translationParts: {} })).toBe(false);
  });

  it('returns false for translationPart with segmentIds not an array', () => {
    expect(
      isValidPartialResponse({
        translationParts: [{ text: 'hello', segmentIds: 'not array' }],
      })
    ).toBe(false);
  });

  it('returns false for translationPart text not a string', () => {
    expect(
      isValidPartialResponse({
        translationParts: [{ text: 123 }],
      })
    ).toBe(false);
  });

  it('returns true for full valid response', () => {
    expect(
      isValidPartialResponse({
        translation: 'hello',
        segments: [{ id: 0, token: '你', pinyin: 'ni3', definition: 'you' }],
        translationParts: [{ text: 'hello', segmentIds: [0] }],
      })
    ).toBe(true);
  });
});
