# HanziLens Agent Guide

Chinese language learning app: parses sentences into word segments with pinyin/definitions.

## Project Structure

```
current/   # Legacy JS implementation (reference only)
remake/    # New TypeScript implementation (active development)
  backend/
  frontend/
```

## Backend (remake/backend/)

See [remake/backend/ARCHITECTURE.md](remake/backend/ARCHITECTURE.md) for details.

**Implementation Status:** See [remake/backend/PLAN.md](remake/backend/PLAN.md) for current progress and overall plan.

**Stack:** Express.js, TypeScript, SQLite (better-sqlite3), OpenRouter (multi-model)

**Key Endpoints:**
- `POST /parse` - AI-powered sentence segmentation (SSE streaming)
- `POST /definitionLookup` - Dictionary lookup

**Environment Variables (.env):**
```
PORT=5000
OPENROUTER_API_KEY=<key>
OPENROUTER_MODEL=<model-id>
CORS_ORIGINS=http://localhost:5173
```

## Frontend (remake/frontend/)

**Stack:** React, Vite, TypeScript

## Development

```bash
# Backend
cd remake/backend && npm install && npm run dev

# Frontend
cd remake/frontend && npm install && npm run dev
```

## Key Decisions

- **Rate Limiting:** IP-based (~100-200 req/min)
- **Dictionary:** SQLite with indexes (simplified, traditional, pinyin)
- **Caching:** LRU cache with TTL for dictionary lookups
- **AI:** OpenRouter API (model configurable via env)
