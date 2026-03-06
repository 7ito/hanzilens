import { Request, Response, NextFunction } from 'express';

/**
 * Custom error class with status code.
 * Messages on HttpError are considered safe to expose to clients
 * when they match the SAFE_ERROR_MESSAGES set below.
 */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Error messages that are safe to send to API clients.
 * Any error message not in this set will be replaced with a generic message.
 * This prevents leaking internal details (env var names, stack traces, file paths).
 */
const SAFE_ERROR_MESSAGES = new Set([
  // AI service errors (from ai.ts)
  'AI service temporarily unavailable',
  'AI request timed out',
  'AI vision service temporarily unavailable',
  'AI vision request timed out',
  'Could not extract sufficient Chinese text from image',
  'AI service request failed',
  'AI service not configured',
  'Model request timed out',
  'Empty response from model',
  'Invalid AI response format',

  // SSE / streaming
  'No response body from AI service',

  // Validation errors (from validation.ts) — these use static strings
  'Missing or invalid "sentence" in request body',
  'Sentence cannot be empty',
  'Invalid "context" in request body',
  'Missing or invalid "image" in request body',
  'Invalid image format. Expected base64 data URL (e.g., data:image/jpeg;base64,...)',
  'Provide either "sentence" or "image", not both',
  'Missing "sentence" or "image" in request body',
]);

/**
 * Check if a message is safe to expose to clients.
 * Matches exact strings from the safelist, or messages that follow known safe patterns.
 */
function isSafeMessage(message: string): boolean {
  if (SAFE_ERROR_MESSAGES.has(message)) return true;

  // Allow validation messages with dynamic but non-sensitive values
  // (e.g., "Sentence exceeds maximum length of 500 characters")
  if (message.startsWith('Sentence exceeds maximum length of ')) return true;
  if (message.startsWith('Context exceeds maximum length of ')) return true;
  if (message.startsWith('Image too large (')) return true;
  if (message.startsWith('Unsupported image type: ')) return true;

  return false;
}

/** Generic messages by HTTP status code range */
function genericMessage(status: number): string {
  if (status === 400) return 'Bad request';
  if (status === 422) return 'Unprocessable content';
  if (status === 429) return 'Too many requests';
  if (status === 503) return 'Service unavailable';
  if (status >= 400 && status < 500) return 'Request error';
  return 'An unexpected error occurred';
}

/**
 * Centralized error handler middleware.
 * Should be registered last after all routes.
 *
 * - Always logs the full error server-side
 * - Only exposes whitelisted safe messages to clients
 * - Returns generic messages for everything else
 */
export function errorHandler(
  err: Error | HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err instanceof HttpError ? err.status : 500;

  // Always log the full error server-side for debugging
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);

  // Determine what message to send to the client
  const clientMessage = isSafeMessage(err.message)
    ? err.message
    : genericMessage(status);

  res.status(status).json({
    error: status >= 500 ? 'Internal Server Error' : 'Error',
    message: clientMessage,
  });
}
