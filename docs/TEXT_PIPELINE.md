# Text Parse Pipeline

This document describes the standard text parsing flow for HanziLens using the /parse endpoint.

## Overview

Text mode supports single-sentence parsing and paragraph parsing. Short inputs stream a single sentence via SSE. Longer or multi-sentence inputs are split into sentence chunks and parsed with queueing while preserving full-prefix context.

## Frontend Flow

Components and hooks:
- frontend/src/components/InputView.tsx (text input + submit)
- frontend/src/hooks/useParse.ts (SSE parsing)
- frontend/src/components/ResultsView.tsx (rendered output)
- frontend/src/hooks/useParagraphParse.ts (paragraph queue + context)
- frontend/src/components/ParagraphResultsView.tsx (sentence cards)
- frontend/src/lib/sentenceSplit.ts (sentence splitting)

Steps (single sentence):
1) User enters text and clicks Go.
2) useParse.startParse sends POST /parse with { sentence }.
3) SSE response is read progressively and partial JSON is parsed using incomplete-json-parser.
4) Segments and translation update live as SSE chunks arrive.
5) Final JSON is parsed at end of stream to fill translationParts.

Steps (paragraph mode):
1) InputView detects multi-sentence or length > 150 characters.
2) sentenceSplit builds SentenceChunk list with start/end offsets.
3) useParagraphParse queues sentence parses (concurrency 3).
4) Each parse sends POST /parse with { sentence, context }, where context is the full input text up to that sentence (trimmed, capped at maxContextLength).
5) Sentence cards render results independently.

UI rendering:
- TranslationSpan highlights translation parts by segment on hover.
- Segment chips show pinyin, definitions, and open dictionary details.

## Backend Flow

Endpoint: POST /parse

Validation:
- validateParseInput routes to validateChineseInput for text.
- maxSentenceLength (500 characters) enforced.
- Optional context is accepted for text input and capped at maxContextLength.
- If no Chinese characters are present, the server returns an immediate translation echo with empty segments.

Rate limiting:
- parseRateLimit allows 30 requests per minute per IP.

Parsing:
- streamParse sends the system prompt + optional context + target sentence to OpenRouter.
- Temperature is set low for consistent output.
- Response is streamed as SSE JSON deltas.

Pinyin correction:
- streamResponseWithCorrection intercepts SSE chunks.
- It replaces pinyin values using a pinyin map computed from the original sentence.

Response format:
```
{
  "translation": "...",
  "segments": [
    { "id": 0, "token": "...", "pinyin": "...", "definition": "..." }
  ],
  "translationParts": [
    { "text": "...", "segmentIds": [0, 1] }
  ]
}
```

## Errors

- 400 for invalid input (missing sentence, too long).
- 503 if AI configuration is missing.
- 500 for upstream model errors.

## Files

- backend/src/routes/parse.ts
- backend/src/services/ai.ts
- backend/src/middleware/validation.ts
- frontend/src/hooks/useParse.ts
- frontend/src/components/ResultsView.tsx
- frontend/src/hooks/useParagraphParse.ts
- frontend/src/components/ParagraphResultsView.tsx
- frontend/src/lib/sentenceSplit.ts
