import { Request, Response, NextFunction } from 'express';

/**
 * Custom error class with status code
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
 * Centralized error handler middleware.
 * Should be registered last after all routes.
 */
export function errorHandler(
  err: Error | HttpError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);

  // Determine status code
  const status = err instanceof HttpError ? err.status : 500;

  // Send error response
  res.status(status).json({
    error: status >= 500 ? 'Internal Server Error' : 'Error',
    message: err.message || 'An unexpected error occurred',
  });
}
