# Backend Implementation Plan

## Overview

Remake the HanziLens backend with TypeScript, SQLite dictionary, OpenRouter AI, and proper modular structure.

## Architecture

### Segmentation Flow

```
User submits sentence
        ↓
   Model segments sentence
   (provides: token, pinyin in context, definition in context)
        ↓
   Return segments to frontend (SSE stream)
        ↓
   User clicks on a segment
        ↓
   Frontend calls POST /definitionLookup
        ↓
   Backend looks up segment in dictionary
        ↓
   Found? → Return all matching entries
   Not found? → Recursively break down until found or single char
        ↓
   Display dictionary popup with all entries
```

**Key points:**
- Model is authoritative for segmentation, contextual pinyin, and contextual definition
- Dictionary is purely for user exploration (popup when clicking a segment)
- Recursive segmentation only happens in `/definitionLookup`, not in `/parse`

---

## Project Structure

```
remake/backend/
├── package.json
├── tsconfig.json
├── .env.example
├── scripts/
│   └── import-cedict.ts      # One-time script to build SQLite from CC-CEDICT
├── data/
│   └── cedict.sqlite         # Generated dictionary database
├── tests/
│   └── *.test.ts             # Vitest tests
└── src/
    ├── app.ts                # Express setup, middleware
    ├── config/
    │   └── index.ts          # Environment config
    ├── routes/
    │   ├── index.ts          # Route aggregation
    │   ├── parse.ts          # POST /parse (AI segmentation)
    │   └── dictionary.ts     # POST /definitionLookup
    ├── services/
    │   ├── ai.ts             # OpenRouter API wrapper
    │   └── dictionary.ts     # SQLite queries + LRU cache
    ├── middleware/
    │   ├── validation.ts     # Input validation
    │   ├── rateLimit.ts      # IP-based rate limiting
    │   └── errorHandler.ts   # Centralized errors
    └── types/
        └── index.ts          # Shared types
```

---

## Phases

### Phase 1: Project Setup & Dictionary Import [COMPLETED]

1. ~~Initialize Node.js project with TypeScript~~
2. ~~Install dependencies: `better-sqlite3`, `typescript`, `tsx`, `vitest`~~
3. ~~Create import script to parse `cedict_ts.u8` into SQLite~~
4. ~~Generate `cedict.sqlite` with indexes~~
5. ~~Add tests for import script~~

**Deliverables:**
- [x] Working import script (`scripts/import-cedict.ts`)
- [x] Populated SQLite database (`data/cedict.sqlite` - 124,257 entries)
- [x] Tests for parsing logic (`tests/import-cedict.test.ts` - 19 tests)

### Phase 2: Dictionary Service & Lookup Endpoint [COMPLETED]

1. ~~Dictionary service with SQLite connection (singleton)~~
2. ~~LRU cache for lookups (5000 max entries)~~
3. ~~`lookup(token)` - returns all matching entries~~
4. ~~`recursiveSegment(token)` - breaks down unknown compounds~~
5. ~~`POST /definitionLookup` endpoint~~
6. ~~Tests for dictionary service~~

**Deliverables:**
- [x] Dictionary service (`src/services/dictionary.ts`)
- [x] Types (`src/types/index.ts`)
- [x] Config loader (`src/config/index.ts`)
- [x] Dictionary route (`src/routes/dictionary.ts`)
- [x] Express app (`src/app.ts`)
- [x] Tests (`tests/dictionary.test.ts` - 20 tests)
- [x] Total: 39 tests passing

### Phase 3: AI Service & Parse Endpoint [COMPLETED]

1. ~~OpenRouter API wrapper with streaming~~
2. ~~Prompt template for Chinese segmentation (model provides translation)~~
3. ~~`POST /parse` endpoint with SSE streaming~~
4. ~~Input validation middleware (25% Chinese, 500 char limit)~~

**Deliverables:**
- [x] AI service (`src/services/ai.ts`)
- [x] Validation middleware (`src/middleware/validation.ts`)
- [x] Parse route (`src/routes/parse.ts`)
- [x] Updated config with OpenRouter settings
- [x] Updated .env.example with documentation

### Phase 4: Rate Limiting & Error Handling

1. Rate limiting (IP-based, ~100-200 req/min)
2. Centralized error handler
3. Environment variable validation on startup

**Deliverables:** Production-ready middleware

### Phase 5: Frontend Remake [COMPLETED]

1. ~~Set up React + TypeScript + Vite + shadcn/ui~~
2. ~~Create InputView with validation (150 char limit, 25% Chinese)~~
3. ~~Implement SSE streaming with progressive rendering~~
4. ~~Create ResultsView with tone-colored pinyin~~
5. ~~Create draggable DictionaryPopup~~
6. ~~Test end-to-end with backend~~

**Deliverables:**
- [x] Types (`src/types/index.ts`)
- [x] API client (`src/lib/api.ts`)
- [x] Pinyin utilities (`src/lib/pinyin.ts`)
- [x] InputView component (`src/components/InputView.tsx`)
- [x] ResultsView component (`src/components/ResultsView.tsx`)
- [x] Segment component (`src/components/Segment.tsx`)
- [x] DictionaryPopup component (`src/components/DictionaryPopup.tsx`)
- [x] useParse hook (`src/hooks/useParse.ts`)
- [x] App with view routing (`src/App.tsx`)

### Phase 6: Polish & Documentation [CURRENT]

1. Dark mode toggle
2. Help/Info dialog
3. Rate limiting middleware
4. Error boundaries
5. Update documentation

**Deliverables:** Production-ready application

---

## Types

```typescript
interface DictionaryEntry {
  id: number;
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

interface ParseResponse {
  // SSE stream with segments
}

interface LookupRequest {
  token: string;
}

interface LookupResponse {
  entries: DictionaryEntry[];
  segments?: string[];  // Only if recursive breakdown was needed
}
```

---

## SQLite Schema

```sql
CREATE TABLE entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  simplified TEXT NOT NULL,
  traditional TEXT NOT NULL,
  pinyin TEXT NOT NULL,
  definitions TEXT NOT NULL  -- JSON array of strings
);

CREATE INDEX idx_simplified ON entries(simplified);
CREATE INDEX idx_traditional ON entries(traditional);
CREATE INDEX idx_pinyin ON entries(pinyin);
```

---

## Dependencies

```json
{
  "dependencies": {
    "express": "^4.21.x",
    "better-sqlite3": "^11.x",
    "lru-cache": "^10.x",
    "express-rate-limit": "^7.x",
    "dotenv": "^16.x",
    "cors": "^2.x"
  },
  "devDependencies": {
    "typescript": "^5.x",
    "tsx": "^4.x",
    "@types/node": "^22.x",
    "@types/express": "^5.x",
    "@types/better-sqlite3": "^7.x",
    "@types/cors": "^2.x",
    "vitest": "^2.x"
  }
}
```

---

## Environment Variables

```
PORT=5000
OPENROUTER_API_KEY=<key>
OPENROUTER_MODEL=<model-id>
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
```

---

## Frontend Structure

```
remake/frontend/
├── src/
│   ├── components/
│   │   ├── ui/               # shadcn components
│   │   ├── InputView.tsx     # Text input with validation
│   │   ├── ResultsView.tsx   # Translation + segments display
│   │   ├── Segment.tsx       # Word with tone-colored pinyin
│   │   └── DictionaryPopup.tsx # Draggable dictionary lookup
│   ├── hooks/
│   │   └── useParse.ts       # SSE streaming hook
│   ├── lib/
│   │   ├── api.ts            # API client
│   │   ├── pinyin.ts         # Pinyin conversion & tone colors
│   │   └── utils.ts          # Utilities
│   ├── types/
│   │   └── index.ts          # Shared types
│   ├── App.tsx               # Main app
│   ├── main.tsx              # Entry point
│   └── index.css             # Global styles + shadcn theme
├── index.html
├── vite.config.ts            # Dev server on port 5174
└── package.json
```
