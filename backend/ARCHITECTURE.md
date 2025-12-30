# Backend Architecture

## Directory Structure

```
src/
├── app.ts              # Express setup, middleware
├── config/
│   └── index.ts        # Environment config
├── routes/
│   ├── index.ts        # Route aggregation
│   ├── parse.ts        # POST /parse (AI segmentation)
│   └── dictionary.ts   # POST /definitionLookup
├── services/
│   ├── ai.ts           # DashScope API wrapper
│   └── dictionary.ts   # SQLite queries
├── middleware/
│   ├── validation.ts   # Input validation
│   ├── rateLimit.ts    # IP-based rate limiting
│   └── errorHandler.ts # Centralized errors
└── types/
    └── index.ts        # Shared types
scripts/
└── import-cedict.ts    # Build SQLite from CC-CEDICT
data/
└── cedict.sqlite       # Dictionary DB (generated)
```

## Types

```typescript
interface DictionaryEntry {
  simplified: string;
  traditional: string;
  pinyin: string;
  definitions: string[];
}

interface ParsedSegment {
  token: string;
  pinyin: string;
  definition: string;
}

interface ParseRequest {
  sentence: string;  // Max 1000 chars, min 25% Chinese
}

interface LookupRequest {
  token: string;
}
```

## SQLite Schema

```sql
CREATE TABLE entries (
  id INTEGER PRIMARY KEY,
  simplified TEXT NOT NULL,
  traditional TEXT NOT NULL,
  pinyin TEXT NOT NULL,
  definitions TEXT NOT NULL  -- JSON array
);

CREATE INDEX idx_simplified ON entries(simplified);
CREATE INDEX idx_traditional ON entries(traditional);
```

## AI Service

Uses OpenRouter API for model flexibility. Configure via environment:
- `OPENROUTER_API_KEY` - API key
- `OPENROUTER_MODEL` - Model ID (e.g., `anthropic/claude-3.5-sonnet`)

## Improvements from Legacy

| Area | Legacy | Remake |
|------|--------|--------|
| Language | JavaScript | TypeScript |
| Dictionary | LevelDB (cc-cedict pkg) | SQLite (direct control) |
| Caching | Unbounded Map | LRU with TTL |
| Rate Limit | None | IP-based |
| Structure | Monolithic app.js | Modular routes/services |
| Config | Hardcoded | Environment variables |
| Validation | Partial | Full with length limits |
| AI Provider | Alibaba DashScope (hardcoded) | OpenRouter (configurable) |
