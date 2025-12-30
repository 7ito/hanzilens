import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173'],
  
  // Cache settings
  cache: {
    maxSize: 5000, // Maximum number of cached lookups
  },
} as const;
