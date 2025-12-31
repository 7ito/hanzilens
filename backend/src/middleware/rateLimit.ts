import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for /parse endpoint (AI calls - more expensive)
 * 100 requests per minute per IP
 */
export const parseRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Please wait before parsing more sentences',
  },
});

/**
 * Rate limiter for /definitionLookup endpoint (DB queries - cheaper)
 * 300 requests per minute per IP
 */
export const lookupRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too Many Requests',
    message: 'Please slow down dictionary lookups',
  },
});
