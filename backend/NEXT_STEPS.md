# Phase 2: Dictionary Service & Lookup Endpoint

## Goal

Create a dictionary service that queries the SQLite database with LRU caching, implements recursive segmentation for unknown compounds, and exposes a `POST /definitionLookup` endpoint.

---

## Step 1: Install Additional Dependencies

```bash
npm install lru-cache express cors dotenv
npm install -D @types/express @types/cors
```

Updated dependencies in `package.json`:
- `lru-cache` - For caching dictionary lookups
- `express` - Web framework
- `cors` - CORS middleware
- `dotenv` - Environment variable loading

---

## Step 2: Create Shared Types

Create `src/types/index.ts`:

```typescript
export interface DictionaryEntry {
  id: number;
  simplified: string;
  traditional: string;
  pinyin: string;
  definitions: string[];
}

export interface LookupRequest {
  token: string;
}

export interface LookupResponse {
  entries: DictionaryEntry[];
  segments?: string[];  // Only present if recursive breakdown was needed
}
```

---

## Step 3: Create Dictionary Service

Create `src/services/dictionary.ts`:

### Features

1. **Singleton SQLite connection** - Single database connection for the lifetime of the app
2. **LRU cache** - Cache lookup results with configurable TTL and max size
3. **`lookup(token)`** - Query by simplified OR traditional, return all matching entries
4. **`recursiveSegment(token)`** - Break down unknown compounds into known words

### Implementation Notes

```typescript
import Database from 'better-sqlite3';
import { LRUCache } from 'lru-cache';

// Singleton database connection
let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!db) {
    db = new Database(dbPath, { readonly: true });
  }
  return db;
}

// LRU cache for lookups
const cache = new LRUCache<string, DictionaryEntry[]>({
  max: 10000,        // Max 10k entries
  ttl: 1000 * 60 * 60,  // 1 hour TTL
});

// Lookup function
export function lookup(token: string): DictionaryEntry[] {
  // Check cache first
  const cached = cache.get(token);
  if (cached) return cached;
  
  // Query database (simplified OR traditional)
  const results = db.prepare(`
    SELECT * FROM entries 
    WHERE simplified = ? OR traditional = ?
  `).all(token, token);
  
  // Parse definitions JSON and cache
  const entries = results.map(parseEntry);
  cache.set(token, entries);
  return entries;
}

// Recursive segmentation (from legacy app.js)
export function recursiveSegment(token: string): string[] {
  // Base cases
  if (token.length === 0) return [];
  if (lookup(token).length > 0) return [token];
  
  // Try progressively smaller prefixes
  for (let i = token.length - 1; i >= 1; i--) {
    const left = token.slice(0, i);
    const right = token.slice(i);
    
    if (lookup(left).length > 0) {
      const rightSegments = recursiveSegment(right);
      if (rightSegments.length > 0 || right.length === 0) {
        return [left, ...rightSegments];
      }
    }
  }
  
  // Fallback: split off first character
  const first = token[0];
  const rest = token.slice(1);
  return [first, ...recursiveSegment(rest)];
}
```

---

## Step 4: Create Dictionary Route

Create `src/routes/dictionary.ts`:

```typescript
import { Router } from 'express';
import { lookup, recursiveSegment } from '../services/dictionary.js';

const router = Router();

router.post('/definitionLookup', (req, res) => {
  const { token } = req.body;
  
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'No token provided' });
  }
  
  const entries = lookup(token);
  
  if (entries.length > 0) {
    // Direct match found
    return res.json({ entries });
  }
  
  // No direct match - try recursive segmentation
  const segments = recursiveSegment(token);
  const allEntries: DictionaryEntry[] = [];
  
  for (const segment of segments) {
    allEntries.push(...lookup(segment));
  }
  
  return res.json({ 
    entries: allEntries,
    segments 
  });
});

export default router;
```

---

## Step 5: Create Minimal Express App

Create `src/app.ts` (minimal version for Phase 2):

```typescript
import express from 'express';
import cors from 'cors';
import dictionaryRouter from './routes/dictionary.js';

const app = express();

app.use(express.json());
app.use(cors());

app.use(dictionaryRouter);

app.get('/', (req, res) => {
  res.send('HanziLens API');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

---

## Step 6: Create Tests

Create `tests/dictionary.test.ts`:

### Unit Tests for `lookup()`
- Returns entries for known simplified characters (你好)
- Returns entries for known traditional characters (中國)
- Returns multiple entries for characters with multiple readings (了)
- Returns empty array for unknown tokens
- Caching works (second call faster / uses cache)

### Unit Tests for `recursiveSegment()`
- Returns single segment for known word
- Breaks down unknown compound into known parts
- Handles single characters
- Handles mixed known/unknown sequences

### Integration Tests for `/definitionLookup`
- Returns entries for known token
- Returns entries and segments for unknown compound
- Returns 400 for missing token
- Returns 400 for invalid token type

---

## Step 7: Test the Endpoint

```bash
# Start the server
npm run dev

# Test known word
curl -X POST http://localhost:5000/definitionLookup \
  -H "Content-Type: application/json" \
  -d '{"token": "你好"}'

# Test unknown compound (should trigger recursive segmentation)
curl -X POST http://localhost:5000/definitionLookup \
  -H "Content-Type: application/json" \
  -d '{"token": "你喜欢"}'
```

---

## File Structure After Phase 2

```
remake/backend/
├── package.json          # Updated with new dependencies
├── tsconfig.json
├── .env.example
├── .gitignore
├── data/
│   └── cedict.sqlite
├── scripts/
│   └── import-cedict.ts
├── src/
│   ├── app.ts            # NEW: Express app entry point
│   ├── types/
│   │   └── index.ts      # NEW: Shared types
│   ├── routes/
│   │   └── dictionary.ts # NEW: /definitionLookup route
│   └── services/
│       └── dictionary.ts # NEW: Dictionary service
└── tests/
    ├── import-cedict.test.ts
    └── dictionary.test.ts # NEW: Dictionary tests
```

---

## Checklist

- [ ] Install new dependencies (`lru-cache`, `express`, `cors`, `dotenv`)
- [ ] Create `src/types/index.ts`
- [ ] Create `src/services/dictionary.ts` with `lookup()` and `recursiveSegment()`
- [ ] Create `src/routes/dictionary.ts` with `POST /definitionLookup`
- [ ] Create minimal `src/app.ts`
- [ ] Create `tests/dictionary.test.ts`
- [ ] Run tests and verify all pass
- [ ] Manual test with curl
- [ ] Commit: `git commit -m "feat(backend): add dictionary service and /definitionLookup endpoint"`

---

## Notes

- The recursive segmentation algorithm matches the legacy implementation in `current/backend/express/app.js`
- LRU cache prevents repeated database queries for the same token
- The service uses readonly database connection for safety
- Singleton pattern ensures single DB connection across requests
