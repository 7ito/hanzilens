import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://localhost:5174'],
  
  // Cache settings
  cache: {
    maxSize: 5000, // Maximum number of cached lookups
  },

  // OpenRouter AI settings
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    // TODO: Set your preferred model in .env, e.g.:
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

  // Input validation
  validation: {
    maxSentenceLength: 500, // Maximum characters in a sentence
    minChineseRatio: 0.25,  // At least 25% Chinese characters
  },
} as const;
