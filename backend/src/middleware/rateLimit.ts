import { createHash } from 'node:crypto';
import { Request, Response, NextFunction, RequestHandler } from 'express';
import { createClient, type RedisClientType } from 'redis';
import { config } from '../config/index.js';
import { hasChinese } from '../utils/chinese.js';
import { captureAnalytics } from '../services/analytics.js';
import {
  CLIENT_FEATURE_HEADER,
  CLIENT_ID_HEADER,
  CLIENT_TYPE_HEADER,
  CLIENT_VERSION_HEADER,
  getRawClientIdentifier,
  getRequestIp,
} from '../services/clientIdentity.js';

type RateLimitScope = 'client' | 'ip' | 'global';
type RateLimitWindow = 'minute' | 'hour' | 'day';

interface RateLimitPolicy {
  name: string;
  scope: RateLimitScope;
  window: RateLimitWindow;
  windowMs: number;
  limit: number;
}

interface RateLimiterOptions {
  skip?: (req: Request) => boolean;
}

interface CounterResult {
  count: number;
  resetAt: number;
}

interface PolicyResult extends CounterResult {
  policy: RateLimitPolicy;
  key: string;
}

interface MemoryCounter {
  count: number;
  resetAt: number;
}

const MEMORY_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

const memoryCounters = new Map<string, MemoryCounter>();
let lastMemorySweepAt = 0;
let redisClient: RedisClientType | null = null;
let redisConnectPromise: Promise<void> | null = null;
let loggedRedisFailure = false;

function getRedisClient(): RedisClientType | null {
  if (!config.rateLimit.redisUrl) return null;

  if (!redisClient) {
    redisClient = createClient({ url: config.rateLimit.redisUrl });
    redisClient.on('error', (error) => {
      if (!loggedRedisFailure) {
        console.error('Redis rate limit store error. Falling back to in-memory counters when needed:', error);
        loggedRedisFailure = true;
      }
    });
    redisConnectPromise = redisClient.connect().then(() => undefined).catch((error) => {
      if (!loggedRedisFailure) {
        console.error('Could not connect Redis rate limit store. Falling back to in-memory counters:', error);
        loggedRedisFailure = true;
      }
    });
  }

  return redisClient;
}

function sweepMemoryCounters(now: number): void {
  if (now - lastMemorySweepAt < MEMORY_SWEEP_INTERVAL_MS) return;
  lastMemorySweepAt = now;

  for (const [key, counter] of memoryCounters.entries()) {
    if (counter.resetAt <= now) {
      memoryCounters.delete(key);
    }
  }
}

function getWindowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

function hashRateLimitIdentifier(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24);
}

function getPolicySubject(req: Request, scope: RateLimitScope): string | null {
  if (scope === 'client') return getRawClientIdentifier(req);
  if (scope === 'ip') return getRequestIp(req);
  return 'all';
}

function buildCounterKey(limiterName: string, policy: RateLimitPolicy, subject: string, now: number): { key: string; resetAt: number } {
  const windowStart = getWindowStart(now, policy.windowMs);
  const resetAt = windowStart + policy.windowMs;
  const subjectHash = hashRateLimitIdentifier(subject);
  const key = `rate-limit:${limiterName}:${policy.name}:${policy.scope}:${subjectHash}:${windowStart}`;
  return { key, resetAt };
}

async function incrementMemoryCounter(key: string, resetAt: number, now: number): Promise<CounterResult> {
  sweepMemoryCounters(now);

  const existing = memoryCounters.get(key);
  if (!existing || existing.resetAt <= now) {
    const next = { count: 1, resetAt };
    memoryCounters.set(key, next);
    return next;
  }

  existing.count += 1;
  return existing;
}

async function incrementRedisCounter(key: string, resetAt: number, now: number): Promise<CounterResult | null> {
  const client = getRedisClient();
  if (!client) return null;

  try {
    await redisConnectPromise;
    if (!client.isOpen) return null;

    const count = await client.incr(key);
    if (count === 1) {
      await client.pExpire(key, Math.max(1, resetAt - now));
    }
    return { count, resetAt };
  } catch (error) {
    if (!loggedRedisFailure) {
      console.error('Redis rate limit increment failed. Falling back to in-memory counters:', error);
      loggedRedisFailure = true;
    }
    return null;
  }
}

async function incrementCounter(key: string, resetAt: number, now: number): Promise<CounterResult> {
  const redisResult = await incrementRedisCounter(key, resetAt, now);
  if (redisResult) return redisResult;

  if (config.rateLimit.requireRedis) {
    throw new Error('Redis rate limit store unavailable');
  }

  return incrementMemoryCounter(key, resetAt, now);
}

function activePolicies(policies: RateLimitPolicy[]): RateLimitPolicy[] {
  return policies.filter((policy) => policy.limit > 0);
}

function setRateLimitHeaders(res: Response, results: PolicyResult[], now: number): void {
  if (results.length === 0) return;

  const tightest = results.reduce((best, current) => {
    const bestRemaining = Math.max(0, best.policy.limit - best.count);
    const currentRemaining = Math.max(0, current.policy.limit - current.count);
    return currentRemaining < bestRemaining ? current : best;
  });

  res.setHeader('RateLimit-Limit', String(tightest.policy.limit));
  res.setHeader('RateLimit-Remaining', String(Math.max(0, tightest.policy.limit - tightest.count)));
  res.setHeader('RateLimit-Reset', String(Math.ceil((tightest.resetAt - now) / 1000)));
}

function rateLimitMessage(message: string, retryAfterSeconds: number) {
  return {
    error: 'Too Many Requests',
    message,
    retryAfterSeconds,
  };
}

function createRateLimiter(
  limiterName: string,
  policies: RateLimitPolicy[],
  message: string,
  options: RateLimiterOptions = {}
): RequestHandler {
  const configuredPolicies = activePolicies(policies);

  return async (req: Request, res: Response, next: NextFunction) => {
    if (options.skip?.(req)) {
      next();
      return;
    }

    if (configuredPolicies.length === 0) {
      next();
      return;
    }

    try {
      const now = Date.now();
      const results: PolicyResult[] = [];

      for (const policy of configuredPolicies) {
        const subject = getPolicySubject(req, policy.scope);
        if (!subject) continue;

        const { key, resetAt } = buildCounterKey(limiterName, policy, subject, now);
        const counter = await incrementCounter(key, resetAt, now);
        results.push({ ...counter, policy, key });
      }

      setRateLimitHeaders(res, results, now);

      const exceeded = results
        .filter((result) => result.count > result.policy.limit)
        .sort((a, b) => a.resetAt - b.resetAt)[0];

      if (exceeded) {
        const retryAfterSeconds = Math.max(1, Math.ceil((exceeded.resetAt - now) / 1000));
        captureAnalytics('rate_limit_blocked', {
          limiter_name: limiterName,
          policy_name: exceeded.policy.name,
          policy_scope: exceeded.policy.scope,
          limit: exceeded.policy.limit,
          count: exceeded.count,
          retry_after_seconds: retryAfterSeconds,
          route: req.path,
        });
        res.setHeader('Retry-After', String(retryAfterSeconds));
        res.status(429).json(rateLimitMessage(message, retryAfterSeconds));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function minutePolicy(name: string, scope: RateLimitScope, limit: number): RateLimitPolicy {
  return { name, scope, window: 'minute', windowMs: 60 * 1000, limit };
}

function hourPolicy(name: string, scope: RateLimitScope, limit: number): RateLimitPolicy {
  return { name, scope, window: 'hour', windowMs: 60 * 60 * 1000, limit };
}

function dayPolicy(name: string, scope: RateLimitScope, limit: number): RateLimitPolicy {
  return { name, scope, window: 'day', windowMs: 24 * 60 * 60 * 1000, limit };
}

const parseLimits = config.rateLimit.parse;
const ocrLimits = config.rateLimit.ocr;
const lookupLimits = config.rateLimit.lookup;
const evalLimits = config.rateLimit.eval;
const abuseLimits = config.rateLimit.abuse;

function shouldSkipBillableParseLimit(req: Request): boolean {
  const validatedText = (req as Request & { validatedText?: string }).validatedText;
  return typeof validatedText === 'string' && !hasChinese(validatedText);
}

/**
 * Pre-validation abuse throttle for /parse requests.
 * Billable parse quota is applied after validation.
 */
export const parseRequestAbuseRateLimit = createRateLimiter('parse-request', [
  minutePolicy('ip-minute', 'ip', abuseLimits.parseIpPerMinute),
  hourPolicy('ip-hour', 'ip', abuseLimits.parseIpPerHour),
], 'Please slow down parse requests');

/**
 * Pre-validation abuse throttle for /ocr requests.
 * Billable OCR quota is applied after image validation.
 */
export const ocrRequestAbuseRateLimit = createRateLimiter('ocr-request', [
  minutePolicy('ip-minute', 'ip', abuseLimits.ocrIpPerMinute),
  hourPolicy('ip-hour', 'ip', abuseLimits.ocrIpPerHour),
], 'Please slow down OCR requests');

/**
 * Rate limiter for /parse text requests.
 */
export const parseRateLimit = createRateLimiter('parse', [
  minutePolicy('client-minute', 'client', parseLimits.clientPerMinute),
  hourPolicy('client-hour', 'client', parseLimits.clientPerHour),
  dayPolicy('client-day', 'client', parseLimits.clientPerDay),
  minutePolicy('ip-minute', 'ip', parseLimits.ipPerMinute),
  hourPolicy('ip-hour', 'ip', parseLimits.ipPerHour),
  dayPolicy('ip-day', 'ip', parseLimits.ipPerDay),
  dayPolicy('global-day', 'global', parseLimits.globalPerDay),
], 'Please wait before parsing more sentences', {
  skip: shouldSkipBillableParseLimit,
});

/**
 * Rate limiter for OCR requests.
 */
export const ocrRateLimit = createRateLimiter('ocr', [
  minutePolicy('client-minute', 'client', ocrLimits.clientPerMinute),
  hourPolicy('client-hour', 'client', ocrLimits.clientPerHour),
  dayPolicy('client-day', 'client', ocrLimits.clientPerDay),
  minutePolicy('ip-minute', 'ip', ocrLimits.ipPerMinute),
  hourPolicy('ip-hour', 'ip', ocrLimits.ipPerHour),
  dayPolicy('ip-day', 'ip', ocrLimits.ipPerDay),
  dayPolicy('global-day', 'global', ocrLimits.globalPerDay),
], 'Please wait before using OCR again');

/**
 * Applies OCR rate limits only when /parse is called with image input.
 * This protects the legacy combined image parse path.
 */
export const imageParseRateLimit: RequestHandler = (req, res, next) => {
  if (req.body && typeof req.body === 'object' && typeof req.body.image === 'string') {
    void ocrRateLimit(req, res, next);
    return;
  }
  next();
};

/**
 * Rate limiter for /definitionLookup endpoint.
 */
export const lookupRateLimit = createRateLimiter('lookup', [
  minutePolicy('client-minute', 'client', lookupLimits.clientPerMinute),
  dayPolicy('client-day', 'client', lookupLimits.clientPerDay),
  minutePolicy('ip-minute', 'ip', lookupLimits.ipPerMinute),
  dayPolicy('ip-day', 'ip', lookupLimits.ipPerDay),
], 'Please slow down dictionary lookups');

/**
 * Rate limiter for /eval/parse endpoint.
 */
export const evalRateLimit = createRateLimiter('eval', [
  minutePolicy('ip-minute', 'ip', evalLimits.ipPerMinute),
], 'Eval endpoint rate limit exceeded');

export const rateLimitClientHeaders = [
  CLIENT_ID_HEADER,
  CLIENT_TYPE_HEADER,
  CLIENT_VERSION_HEADER,
  CLIENT_FEATURE_HEADER,
] as const;
