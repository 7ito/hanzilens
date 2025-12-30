import express from 'express';
import cors from 'cors';
import { config } from './config/index.js';
import dictionaryRouter from './routes/dictionary.js';

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
  res.json({ status: 'ok', message: 'HanziLens API is running' });
});

// Routes
app.use(dictionaryRouter);

// Start server
app.listen(config.port, () => {
  console.log(`Server listening at http://localhost:${config.port}`);
});

export default app;
