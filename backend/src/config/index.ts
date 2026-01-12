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

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  corsOrigins: parseCorsOrigins(),
  
  // Cache settings
  cache: {
    maxSize: 5000, // Maximum number of cached lookups
  },

  // Xiaomi MiMo settings (primary provider for /parse)
  mimo: {
    apiKey: process.env.MIMO_API_KEY || '',
    // Model to use for text parsing (recommended: mimo-v2-flash)
    model: process.env.MIMO_MODEL || '',
    baseUrl: 'https://api.xiaomimimo.com',
  },

  // OpenRouter settings (optional; used for OCR + development eval routes)
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    // Used by /eval/parse (development-only) for model comparisons
    model: process.env.OPENROUTER_MODEL || '',
    // Vision model for image OCR stage (optional)
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
    maxTextLength: 200,    // Truncate extracted text to this length
    minChineseChars: 2,    // Minimum Chinese characters required
  },

  // Input validation
  validation: {
    maxSentenceLength: 500, // Maximum characters in a sentence
    minChineseRatio: 0.25,  // At least 25% Chinese characters
  },
} as const;

/**
 * Validate required configuration at startup.
 * Throws an error if critical configuration is missing.
 */
export function validateConfig(): void {
  const errors: string[] = [];

  // Required for the main /parse endpoint (text parsing)
  if (!config.mimo.apiKey) {
    errors.push('MIMO_API_KEY is required');
  }

  if (!config.mimo.model) {
    errors.push('MIMO_MODEL is required');
  }

  // Optional providers/features
  // - Image parsing requires OpenRouter API key + vision model
  // - /eval routes (dev-only) require OpenRouter API key + model
  if (!config.openrouter.apiKey) {
    console.warn('Note: OPENROUTER_API_KEY not set. Image parsing and /eval routes will be unavailable.');
  } else {
    if (!config.openrouter.visionModel) {
      console.warn('Note: OPENROUTER_VISION_MODEL not set. Image parsing will be unavailable.');
    }

    if (!config.openrouter.model) {
      console.warn('Note: OPENROUTER_MODEL not set. /eval routes will be unavailable.');
    }
  }

  if (errors.length > 0) {
    console.error('Configuration errors:');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('\nPlease set the required environment variables in .env');
    process.exit(1);
  }

  console.log('Configuration validated successfully');
}
