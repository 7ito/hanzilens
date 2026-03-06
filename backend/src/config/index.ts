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

export const config = {
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

  // OpenRouter AI settings
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    // Set your preferred model in .env, e.g.:
    // - anthropic/claude-3.5-sonnet (high quality)
    // - google/gemini-flash-1.5 (fast, cheap)
    // - qwen/qwen-2.5-72b-instruct (good for Chinese)
    model: process.env.OPENROUTER_MODEL || '',
    // Vision model for image OCR (e.g., openai/gpt-4o, anthropic/claude-sonnet-4)
    visionModel: process.env.OPENROUTER_VISION_MODEL || '',
    baseUrl: 'https://openrouter.ai/api/v1',
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

  // Vision model is optional - only warn if not set
  if (!config.openrouter.visionModel) {
    console.warn('Note: OPENROUTER_VISION_MODEL not set. Image parsing will be unavailable.');
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPlease set the required environment variables in .env');
    process.exit(1);
  }

  console.log('Configuration validated successfully');
}
