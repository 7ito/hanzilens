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

  // OpenRouter AI settings
  openrouter: {
    apiKey: process.env.OPENROUTER_API_KEY || '',
    // Two-stage pipeline models (recommended)
    // Stage 1: Segmentation - fast, good at Chinese parsing
    segmentationModel: process.env.OPENROUTER_SEGMENTATION_MODEL || '',
    // Stage 2: Alignment - better at translation-to-segment mapping
    alignmentModel: process.env.OPENROUTER_ALIGNMENT_MODEL || '',
    // Legacy single model (fallback if stage models not set)
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
 * Get the model to use for Stage 1 (segmentation).
 * Falls back to legacy single model if stage models not configured.
 */
export function getSegmentationModel(): string {
  return config.openrouter.segmentationModel || config.openrouter.model;
}

/**
 * Get the model to use for Stage 2 (alignment).
 * Falls back to legacy single model if stage models not configured.
 */
export function getAlignmentModel(): string {
  return config.openrouter.alignmentModel || config.openrouter.model;
}

/**
 * Check if two-stage pipeline is explicitly configured.
 * Returns true if both segmentation and alignment models are set.
 */
export function isTwoStageConfigured(): boolean {
  return !!(config.openrouter.segmentationModel && config.openrouter.alignmentModel);
}

/**
 * Validate required configuration at startup.
 * Throws an error if critical configuration is missing.
 */
export function validateConfig(): void {
  const errors: string[] = [];

  if (!config.openrouter.apiKey) {
    errors.push('OPENROUTER_API_KEY is required');
  }

  // Check for two-stage OR single-model config
  const hasTwoStage = config.openrouter.segmentationModel && config.openrouter.alignmentModel;
  const hasSingleModel = config.openrouter.model;
  
  if (!hasTwoStage && !hasSingleModel) {
    errors.push('Either OPENROUTER_MODEL or both OPENROUTER_SEGMENTATION_MODEL and OPENROUTER_ALIGNMENT_MODEL must be set');
  }
  
  // Partial two-stage config is an error
  if ((config.openrouter.segmentationModel && !config.openrouter.alignmentModel) ||
      (!config.openrouter.segmentationModel && config.openrouter.alignmentModel)) {
    errors.push('Both OPENROUTER_SEGMENTATION_MODEL and OPENROUTER_ALIGNMENT_MODEL must be set together');
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

  // Log which mode we're using
  if (hasTwoStage) {
    console.log('Configuration validated: Two-stage pipeline enabled');
    console.log(`  Segmentation model: ${config.openrouter.segmentationModel}`);
    console.log(`  Alignment model: ${config.openrouter.alignmentModel}`);
  } else {
    console.log('Configuration validated: Single-model mode');
    console.log(`  Model: ${config.openrouter.model}`);
  }
}
