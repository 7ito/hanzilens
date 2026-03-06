import { describe, it, expect, vi } from 'vitest';
import type { Response, NextFunction } from 'express';
import {
  validateChineseInput,
  validateImageInput,
  validateParseInput,
  type ValidatedRequest,
} from '../src/middleware/validation.js';

// Helper to create a mock request
function mockReq(body: Record<string, unknown> = {}): ValidatedRequest {
  return { body } as ValidatedRequest;
}

// Helper to create a mock response with json/status spy
function mockRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

// Helper to create a mock next function
function mockNext(): NextFunction {
  return vi.fn() as unknown as NextFunction;
}

// Valid base64 JPEG data URL (tiny 1x1 pixel)
const VALID_JPEG =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP/bAEMABgQFBgUEBgYFBgcHBggKEAoKCQkKFA4PDBAXFBgYFxQWFhodJR8aGyMcFhYgLCAjJicpKikZHy0wLSgwJSg/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/xAAUAQEAAAAAAAAAAAAAAAAAAAAA/8QAFBEBAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACEQMRAD8AKwA//9k=';

describe('validateChineseInput', () => {
  it('calls next() with valid sentence and attaches validatedText', () => {
    const req = mockReq({ sentence: '你好世界' });
    const res = mockRes();
    const next = mockNext();

    validateChineseInput(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedText).toBe('你好世界');
  });

  it('trims whitespace from sentence', () => {
    const req = mockReq({ sentence: '  你好  ' });
    const res = mockRes();
    const next = mockNext();

    validateChineseInput(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedText).toBe('你好');
  });

  it('returns 400 for missing sentence field', () => {
    const req = mockReq({});
    const res = mockRes();
    const next = mockNext();

    validateChineseInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Bad Request' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 for sentence that is not a string', () => {
    const req = mockReq({ sentence: 123 });
    const res = mockRes();
    const next = mockNext();

    validateChineseInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 for empty/whitespace-only sentence', () => {
    const req = mockReq({ sentence: '   ' });
    const res = mockRes();
    const next = mockNext();

    validateChineseInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Sentence cannot be empty' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 for sentence exceeding max length', () => {
    const longSentence = '你'.repeat(501);
    const req = mockReq({ sentence: longSentence });
    const res = mockRes();
    const next = mockNext();

    validateChineseInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('exceeds maximum length'),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts sentence at exactly max length', () => {
    const exactSentence = '你'.repeat(500);
    const req = mockReq({ sentence: exactSentence });
    const res = mockRes();
    const next = mockNext();

    validateChineseInput(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedText).toBe(exactSentence);
  });

  it('handles valid context - attaches validatedContext', () => {
    const req = mockReq({ sentence: '你好', context: '这是上下文' });
    const res = mockRes();
    const next = mockNext();

    validateChineseInput(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedContext).toBe('这是上下文');
  });

  it('returns 400 for context that is not a string', () => {
    const req = mockReq({ sentence: '你好', context: 123 });
    const res = mockRes();
    const next = mockNext();

    validateChineseInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 for context exceeding max length', () => {
    const longContext = '字'.repeat(1501);
    const req = mockReq({ sentence: '你好', context: longContext });
    const res = mockRes();
    const next = mockNext();

    validateChineseInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Context exceeds maximum length'),
      })
    );
  });

  it('ignores empty context after trimming', () => {
    const req = mockReq({ sentence: '你好', context: '   ' });
    const res = mockRes();
    const next = mockNext();

    validateChineseInput(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedContext).toBeUndefined();
  });

  it('allows missing context field entirely', () => {
    const req = mockReq({ sentence: '你好' });
    const res = mockRes();
    const next = mockNext();

    validateChineseInput(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedContext).toBeUndefined();
  });
});

describe('validateImageInput', () => {
  it('calls next() with valid JPEG data URL', () => {
    const req = mockReq({ image: VALID_JPEG });
    const res = mockRes();
    const next = mockNext();

    validateImageInput(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedImage).toBe(VALID_JPEG);
  });

  it('returns 400 for missing image field', () => {
    const req = mockReq({});
    const res = mockRes();
    const next = mockNext();

    validateImageInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 for image that is not a string', () => {
    const req = mockReq({ image: 123 });
    const res = mockRes();
    const next = mockNext();

    validateImageInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid data URL format', () => {
    const req = mockReq({ image: 'not-a-data-url' });
    const res = mockRes();
    const next = mockNext();

    validateImageInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Invalid image format'),
      })
    );
  });

  it('returns 400 for unsupported mime type (fails regex match)', () => {
    // image/bmp is not matched by the DATA_URL_REGEX (only jpeg|png|webp|gif)
    // so parseDataUrl returns null -> "Invalid image format" error
    const req = mockReq({ image: 'data:image/bmp;base64,AAAA' });
    const res = mockRes();
    const next = mockNext();

    validateImageInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Invalid image format'),
      })
    );
  });

  it('accepts all supported image types', () => {
    const types = ['jpeg', 'png', 'webp', 'gif'] as const;
    for (const type of types) {
      const req = mockReq({ image: `data:image/${type};base64,AAAA` });
      const res = mockRes();
      const next = mockNext();

      validateImageInput(req, res, next);

      expect(next).toHaveBeenCalled();
    }
  });

  it('returns 400 for image exceeding 5MB size limit', () => {
    // ~7MB of base64 data
    const largeBase64 = 'A'.repeat(7 * 1024 * 1024);
    const req = mockReq({
      image: `data:image/jpeg;base64,${largeBase64}`,
    });
    const res = mockRes();
    const next = mockNext();

    validateImageInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Image too large'),
      })
    );
  });
});

describe('validateParseInput', () => {
  it('routes sentence input to validateChineseInput', () => {
    const req = mockReq({ sentence: '你好' });
    const res = mockRes();
    const next = mockNext();

    validateParseInput(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedText).toBe('你好');
  });

  it('routes image input to validateImageInput', () => {
    const req = mockReq({ image: VALID_JPEG });
    const res = mockRes();
    const next = mockNext();

    validateParseInput(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.validatedImage).toBe(VALID_JPEG);
  });

  it('returns 400 when both sentence and image provided', () => {
    const req = mockReq({ sentence: '你好', image: VALID_JPEG });
    const res = mockRes();
    const next = mockNext();

    validateParseInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('not both'),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 when neither sentence nor image provided', () => {
    const req = mockReq({});
    const res = mockRes();
    const next = mockNext();

    validateParseInput(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('Missing'),
      })
    );
    expect(next).not.toHaveBeenCalled();
  });
});
