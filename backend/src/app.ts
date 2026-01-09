import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateConfig } from './config/index.js';
import dictionaryRouter from './routes/dictionary.js';
import parseRouter from './routes/parse.js';
import { errorHandler } from './middleware/errorHandler.js';

// Validate required configuration on startup
validateConfig();

const app = express();

// Trust proxy (for Caddy/nginx/Cloudflare - ensures correct client IP for rate limiting)
app.set('trust proxy', 1);

// Security middleware - set various HTTP headers
app.use(helmet());

// Request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path} - ${req.ip}`);
  next();
});

// CORS configuration
app.use(cors({
  origin: config.corsOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Body parser with size limit (10MB to accommodate base64 images)
app.use(express.json({ limit: '10mb' }));

// Health check endpoint
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'HanziLens API is running',
  });
});

// Routes
app.use(dictionaryRouter);
app.use(parseRouter);

// Eval routes - development only (no rate limiting, allows model override)
if (process.env.NODE_ENV !== 'production') {
  import('./routes/eval.js').then(evalRouter => {
    app.use('/eval', evalRouter.default);
    console.log('Eval routes enabled (development mode)');
  }).catch(err => {
    console.error('Failed to load eval routes:', err);
  });
}

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  console.log(`Server listening at http://localhost:${config.port}`);
});

export default app;
