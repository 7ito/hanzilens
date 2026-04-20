# Image Mode Pipeline

This document describes the end-to-end image mode flow for HanziLens, from image upload to OCR overlays and sentence parsing.

## Overview

Image mode uses a two-step approach:

1) OCR with layout to extract line text + bounding boxes.
2) Per-sentence parsing using the regular /parse text endpoint.

The UI preserves the original image layout using colored overlays and renders the parsed sentence details below the image.

## Backend: OCR Layout Extraction

Endpoint: POST /ocr

Request body:
```
{ "image": "data:image/png;base64,..." }
```

Response body (normalized boxes 0-1):
```
{
  "imageSize": { "width": 1234, "height": 987 },
  "lines": [
    { "id": "l1", "text": "...", "box": { "x": 0.12, "y": 0.24, "w": 0.44, "h": 0.05 } }
  ]
}
```

Key steps:
- Google Cloud Vision runs document OCR with Chinese language hints.
- Word-level OCR output is grouped into line objects with merged bounding boxes.
- Bounding boxes are normalized to 0-1 coordinates.
- Empty lines are dropped.
- Backend enforces geometric reading order before returning lines:
  - Horizontal text: top-to-bottom, left-to-right.
  - Vertical text: columns right-to-left, top-to-bottom within each column.
  - Selection uses lightweight geometry + boundary heuristics (no extra model calls).
- Chinese content is validated (minimum Chinese characters).

Errors:
- 503 if Google Cloud Vision is not configured.
- 422 if insufficient Chinese text is detected.

Files:
- backend/src/services/ai.ts (OCR extraction, line grouping, normalization)
- backend/src/routes/parse.ts (/ocr route)
- backend/src/config/index.ts (OCR limits)

## Frontend: Sentence Construction

Hook: frontend/src/hooks/useImageParse.ts

Steps:
1) startOcr(image) calls POST /ocr and receives lines + boxes.
2) Combined text is built by joining line text with '\n'.
3) Sentence splitter runs on the combined text:
   - Hard breaks: 。！？； plus ASCII ! ? ; and …
   - List markers like 1、2、 start new sentences
   - Repeated punctuation is attached to the previous sentence
   - Punctuation-only chunks are merged into the previous sentence
4) Sentences are stored with start/end offsets into the combined text.

## Frontend: Overlay Geometry

Component: frontend/src/components/ImageResultsView.tsx

For each sentence:
- Intersect sentence offsets with line ranges to derive per-line boxes.
- Each sentence can span multiple boxes (one per line).

Two overlay modes:
- Original: colored highlights over each sentence box.
- Translation: blurred translation overlays drawn in the same boxes.

## Frontend: Translation Overlay Fitting

Translation overlays fit text into the sentence boxes using measured wrapping:

- Boxes are sorted in reading order (top-to-bottom, left-to-right).
- Text is wrapped to each box width using canvas measurement.
- The text flows across boxes sequentially, using all available space.
- Font size falls back 11 -> 10 -> 9 if needed.
- If still too long, an ellipsis is added in the final box.

Padding is subtracted from box dimensions when calculating capacity, so the bottom line does not get clipped.

## Frontend: Parsing + UI

Parsing:
- Each sentence is parsed using POST /parse with text input.
- The request includes a context field containing OCR text before the target sentence (trimmed and capped at maxContextLength).
- A low concurrency queue (3) runs sentences in the background.
- Results are cached per sentence ID.

UI:
- The image is shown with overlays and an Original/Translation toggle.
- Below the image, sentence cards are listed (collapsed by default).
- Each card can be opened independently to show the full text-mode UI:
  - Translation with alignment (TranslationSpan)
  - Segments with pinyin + definitions (Segment)

Errors:
- OCR failure shows a retry prompt.
- Per-sentence parse errors show inline in the card.

Files:
- frontend/src/hooks/useImageParse.ts
- frontend/src/components/ImageResultsView.tsx
- frontend/src/lib/api.ts
- frontend/src/lib/sentenceSplit.ts
- frontend/src/types/index.ts

## Rate Limiting

The /parse endpoint is rate-limited (30 req/min/IP). Image mode can issue multiple sentence parses, so concurrency is capped to limit load.
