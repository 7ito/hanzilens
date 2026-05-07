import 'dotenv/config';

// Parse and validate CORS origins
function parseCorsOrigins(): string[] {
  const origins = process.env.CORS_ORIGINS?.split(',').map(o => o.trim()).filter(Boolean) 
    || ['http://localhost:5173', 'http://localhost:5174'];
  
  // Warn if wildcard CORS is configured (security risk)
  if (origins.includes('*')) {
    console.warn('WARNING: CORS is configured to allow all origins (*). This is a security risk in production.');
  }
  
  return origins;
}

// Parse TRUST_PROXY env var: number string -> number, "true" -> true, unset -> false
function parseTrustProxy(): boolean | number {
  const value = process.env.TRUST_PROXY;
  if (!value) return false;
  if (value === 'true') return true;
  const num = parseInt(value, 10);
  if (Number.isFinite(num) && num > 0) return num;
  return false;
}

function parseIntEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function parseFloatEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const rateLimitUsageMultiplier = parseFloatEnv('RATE_LIMIT_USAGE_MULTIPLIER', 1);

function scaleRateLimit(limit: number): number {
  if (limit <= 0) return limit;
  return Math.max(1, Math.floor(limit * rateLimitUsageMultiplier));
}

function parseRateLimitEnv(name: string, fallback: number): number {
  return scaleRateLimit(parseIntEnv(name, fallback));
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  corsOrigins: parseCorsOrigins(),
  trustProxy: parseTrustProxy(),

  // Eval endpoint (for model benchmarking)
  eval: {
    enabled: process.env.ENABLE_EVAL === 'true',
  },
  
  // Cache settings
  cache: {
    maxSize: 5000, // Maximum number of cached lookups
  },

  // Backend analytics. Disabled unless ANALYTICS_ENABLED=true and PostHog key is set.
  analytics: {
    enabled: process.env.ANALYTICS_ENABLED === 'true',
    posthogKey: process.env.ANALYTICS_POSTHOG_KEY || '',
    posthogHost: process.env.ANALYTICS_POSTHOG_HOST || 'https://app.posthog.com',
    hashSecret: process.env.ANALYTICS_HASH_SECRET || '',
  },

  // Rate limits. Set any global daily limit to 0 to disable that global cap.
  rateLimit: {
    redisUrl: process.env.REDIS_URL || '',
    requireRedis: process.env.RATE_LIMIT_REQUIRE_REDIS === 'true' || process.env.NODE_ENV === 'production',
    usageMultiplier: rateLimitUsageMultiplier,
    abuse: {
      parseIpPerMinute: parseRateLimitEnv('RATE_LIMIT_ABUSE_PARSE_IP_PER_MINUTE', 120),
      parseIpPerHour: parseRateLimitEnv('RATE_LIMIT_ABUSE_PARSE_IP_PER_HOUR', 3000),
      ocrIpPerMinute: parseRateLimitEnv('RATE_LIMIT_ABUSE_OCR_IP_PER_MINUTE', 30),
      ocrIpPerHour: parseRateLimitEnv('RATE_LIMIT_ABUSE_OCR_IP_PER_HOUR', 600),
    },
    parse: {
      clientPerMinute: parseRateLimitEnv('RATE_LIMIT_PARSE_CLIENT_PER_MINUTE', 30),
      clientPerHour: parseRateLimitEnv('RATE_LIMIT_PARSE_CLIENT_PER_HOUR', 180),
      clientPerDay: parseRateLimitEnv('RATE_LIMIT_PARSE_CLIENT_PER_DAY', 500),
      ipPerMinute: parseRateLimitEnv('RATE_LIMIT_PARSE_IP_PER_MINUTE', 60),
      ipPerHour: parseRateLimitEnv('RATE_LIMIT_PARSE_IP_PER_HOUR', 1000),
      ipPerDay: parseRateLimitEnv('RATE_LIMIT_PARSE_IP_PER_DAY', 3000),
      globalPerDay: parseRateLimitEnv('RATE_LIMIT_PARSE_GLOBAL_PER_DAY', 5000),
    },
    ocr: {
      clientPerMinute: parseRateLimitEnv('RATE_LIMIT_OCR_CLIENT_PER_MINUTE', 3),
      clientPerHour: parseRateLimitEnv('RATE_LIMIT_OCR_CLIENT_PER_HOUR', 20),
      clientPerDay: parseRateLimitEnv('RATE_LIMIT_OCR_CLIENT_PER_DAY', 30),
      ipPerMinute: parseRateLimitEnv('RATE_LIMIT_OCR_IP_PER_MINUTE', 10),
      ipPerHour: parseRateLimitEnv('RATE_LIMIT_OCR_IP_PER_HOUR', 100),
      ipPerDay: parseRateLimitEnv('RATE_LIMIT_OCR_IP_PER_DAY', 300),
      globalPerDay: parseRateLimitEnv('RATE_LIMIT_OCR_GLOBAL_PER_DAY', 500),
    },
    lookup: {
      clientPerMinute: parseRateLimitEnv('RATE_LIMIT_LOOKUP_CLIENT_PER_MINUTE', 120),
      clientPerDay: parseRateLimitEnv('RATE_LIMIT_LOOKUP_CLIENT_PER_DAY', 2000),
      ipPerMinute: parseRateLimitEnv('RATE_LIMIT_LOOKUP_IP_PER_MINUTE', 600),
      ipPerDay: parseRateLimitEnv('RATE_LIMIT_LOOKUP_IP_PER_DAY', 10000),
    },
    eval: {
      ipPerMinute: parseRateLimitEnv('RATE_LIMIT_EVAL_IP_PER_MINUTE', 10),
    },
  },

  // OpenRouter AI settings
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    // Set your preferred model in .env, e.g.:
    // - anthropic/claude-3.5-sonnet (high quality)
    // - google/gemini-flash-1.5 (fast, cheap)
    // - qwen/qwen-2.5-72b-instruct (good for Chinese)
    model: process.env.OPENROUTER_MODEL || '',
    baseUrl: 'https://openrouter.ai/api/v1',
    maxTokens: parseIntEnv('OPENROUTER_MAX_TOKENS', 2500),
    promptCostPerToken: parseFloatEnv('OPENROUTER_PROMPT_COST_PER_TOKEN', 0.0000001),
    completionCostPerToken: parseFloatEnv('OPENROUTER_COMPLETION_COST_PER_TOKEN', 0.0000004),
  },

  // Google Cloud Vision settings for image OCR
  googleVision: {
    apiKey: process.env.GOOGLE_CLOUD_VISION_API_KEY || '',
    credentialsJson: process.env.GOOGLE_CLOUD_VISION_CREDENTIALS_JSON || '',
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    endpoint: 'https://vision.googleapis.com/v1/images:annotate',
  },

  // Image upload settings
  image: {
    maxSizeBytes: 5 * 1024 * 1024, // 5MB max
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  },

  // OCR settings (for image parsing)
  ocr: {
    maxTextLength: 500,    // Truncate extracted text to this length
    minChineseChars: 2,    // Minimum Chinese characters required
  },

  // Input validation
  validation: {
    maxSentenceLength: 500, // Maximum characters in a sentence
    maxContextLength: 1500, // Maximum characters in optional context
  },
} as const;

/**
 * Validate required configuration at startup.
 * Throws an error if critical configuration is missing.
 */
export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.openrouter.apiKey) {
    errors.push('OPENROUTER_API_KEY is required');
  }

  if (!config.openrouter.model) {
    errors.push('OPENROUTER_MODEL is required');
  }

  if (config.rateLimit.requireRedis && !config.rateLimit.redisUrl) {
    errors.push('REDIS_URL is required when Redis-backed rate limits are required');
  }

  if (config.analytics.enabled && !config.analytics.hashSecret) {
    errors.push('ANALYTICS_HASH_SECRET is required when analytics are enabled');
  }

  // OCR provider is optional - only warn if not set
  if (
    !config.googleVision.apiKey
    && !config.googleVision.credentialsJson
    && !config.googleVision.credentialsPath
  ) {
    console.warn(
      'Note: Google Cloud Vision credentials not set. Image parsing will be unavailable.'
    );
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPlease set the required environment variables in .env');
    process.exit(1);
  }

  console.log('Configuration validated successfully');
}
