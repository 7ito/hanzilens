import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import dictionaryRouter from './routes/dictionary.js';
import parseRouter from './routes/parse.js';
import { errorHandler } from './middleware/errorHandler.js';
import { isConfigured, getConfigStatus } from './services/ai.js';

const app = express();

// Middleware
app.use(express.json());

// CORS configuration
app.use(cors({
  origin: config.corsOrigins,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
}));

// Health check endpoint
app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'HanziLens API is running',
    ai: isConfigured() ? 'configured' : getConfigStatus(),
  });
});

// Routes
app.use(dictionaryRouter);
app.use(parseRouter);

// Error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  console.log(`Server listening at http://localhost:${config.port}`);
  if (!isConfigured()) {
    console.warn(`Warning: AI service not configured (${getConfigStatus()})`);
    console.warn('The /parse endpoint will return 503 until configured.');
  }
});

export default app;
