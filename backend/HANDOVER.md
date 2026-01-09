# Two-Stage Pipeline Implementation Handover

## Context

HanziLens is a Chinese language learning app that parses sentences into word segments with pinyin and definitions. The current implementation uses a single AI model (MiMo V2 Flash) for all tasks:
1. Translation
2. Word segmentation with pinyin and definitions
3. Translation alignment (mapping English words back to Chinese segments)

### Problem Statement

- **MiMo V2 Flash**: ~40-55 tps, excellent at translation alignment (93.6% valid)
- **Qwen3 30B A3B**: ~75 tps, similar semantic quality, but worse at translation alignment (87.2% valid)

We want to use each model for what it's best at while maximizing throughput.

### Recent Changes (Already Implemented)

In the previous session, we fixed a critical pinyin issue:

**Commit: `d5e07db`** - "fix: reconcile pinyin-pro output with CC-CEDICT for accurate tone notation"

- pinyin-pro was returning full citation tones (e.g., `you3`) but CC-CEDICT uses neutral tones (e.g., `you5` in 朋友)
- Implemented CC-CEDICT reconciliation in `src/services/pinyinCorrection.ts`
- Added `getCharacterReadings()` and `getTokenPinyin()` to `src/services/dictionary.ts`
- Added correction logging to `tests/model-eval/evaluator.ts` and `tests/model-eval/types.ts`
- Pinyin correction now matches CC-CEDICT 100% for tested words

---

## Implementation Plan: Two-Stage Pipeline

### Architecture Overview

```
User Request (Chinese sentence)
         │
         ▼
┌────────────────────────────────────────────────────────┐
│              PARALLEL EXECUTION                        │
│  ┌─────────────────────────┐  ┌─────────────────────┐ │
│  │  Stage 1: Segmentation  │  │  Pinyin Correction  │ │
│  │  (Qwen3 30B A3B)        │  │  (pinyin-pro +      │ │
│  │  sort: "throughput"     │  │   CC-CEDICT)        │ │
│  │                         │  │  ~5ms               │ │
│  │  Output:                │  │                     │ │
│  │  - translation          │  │  Output: PinyinMap  │ │
│  │  - segments             │  │                     │ │
│  │                         │  │                     │ │
│  │  STREAMING to client    │  │                     │ │
│  └─────────────────────────┘  └─────────────────────┘ │
└────────────────────────────────────────────────────────┘
         │
         ▼ (Apply pinyin correction during streaming)
         │
         ▼ (After Stage 1 completes)
┌────────────────────────────────────────────────────────┐
│            Stage 2: Translation Alignment              │
│            (MiMo V2 Flash)                             │
│            sort: "throughput"                          │
│            timeout: 45s                                │
│                                                        │
│  Input: { translation, segments: [{id, token}] }       │
│  Output: { translationParts }                          │
│                                                        │
│  On failure: Skip translationParts (graceful degrade)  │
└────────────────────────────────────────────────────────┘
         │
         ▼
┌────────────────────────────────────────────────────────┐
│                   Final Response                       │
│  { translation, segments, translationParts? }          │
└────────────────────────────────────────────────────────┘
```

### Key Decisions

1. **Keep pinyin in Stage 1 prompt** - AI helps with edge cases pinyin-pro misses (~70% accuracy on difficult polyphonic chars)
2. **45-second timeout** for Stage 2
3. **Use `sort: "throughput"`** in provider config - OpenRouter automatically routes to highest throughput provider
4. **Graceful degradation** - Return result without translationParts if Stage 2 fails
5. **Streaming Strategy (Option A)** - Append translationParts to same JSON at end, no separate SSE events needed
6. **Update eval endpoint** to use two-stage pipeline as well

---

## Files to Modify

### 1. `src/config/index.ts`

Add new model configuration:

```typescript
openrouter: {
  apiKey: process.env.OPENROUTER_API_KEY || '',
  // Stage 1: Segmentation model (fast, good at Chinese)
  segmentationModel: process.env.OPENROUTER_SEGMENTATION_MODEL || 'qwen/qwen3-30b-a3b-instruct',
  // Stage 2: Alignment model (better at translation alignment)
  alignmentModel: process.env.OPENROUTER_ALIGNMENT_MODEL || 'xiaomi/mimo-v2-flashfree',
  // Legacy: single model (for backward compatibility)
  model: process.env.OPENROUTER_MODEL || '',
  visionModel: process.env.OPENROUTER_VISION_MODEL || '',
  baseUrl: 'https://openrouter.ai/api/v1',
},
```

Update `validateConfig()` to check for segmentationModel and alignmentModel.

### 2. `src/services/ai.ts`

#### New Segmentation Prompt (simplified from ~120 lines to ~60)

```typescript
const SEGMENTATION_PROMPT = `You are a Chinese language segmentation assistant.

## Task
Break down a Chinese sentence into word segments with pinyin and definitions.

## Output
Return JSON with:
- "translation": Natural English translation
- "segments": Array of word segments

## Segment Format
Each segment: {"id": N, "token": "中文", "pinyin": "zhong1 wen2", "definition": "meaning"}

## Pinyin Rules
- Tone numbers 1-5: ni3 hao3, ma5
- Use u: for ü: nu:3
- Space between syllables: zhong1 guo2

## Segmentation Rules
- Segment into natural word units (词语)
- Punctuation: {"id": N, "token": "。", "pinyin": "", "definition": ""}
- Numbers/English: {"id": N, "token": "2024", "pinyin": "", "definition": ""}

## Example
Input: 你喜欢中国菜吗？
Output:
{
  "translation": "Do you like Chinese food?",
  "segments": [
    {"id": 0, "token": "你", "pinyin": "ni3", "definition": "you"},
    {"id": 1, "token": "喜欢", "pinyin": "xi3 huan5", "definition": "like"},
    {"id": 2, "token": "中国", "pinyin": "zhong1 guo2", "definition": "Chinese"},
    {"id": 3, "token": "菜", "pinyin": "cai4", "definition": "food"},
    {"id": 4, "token": "吗", "pinyin": "ma5", "definition": "(question)"},
    {"id": 5, "token": "？", "pinyin": "", "definition": ""}
  ]
}`;
```

#### New Alignment Prompt

```typescript
const ALIGNMENT_PROMPT = `You are a translation alignment assistant.

## Task
Map English translation parts back to Chinese segments.

## Input
- translation: English translation string
- segments: Array of {id, token} pairs

## Output
Return JSON:
{"translationParts": [{"text": "word", "segmentIds": [0]}]}

## Critical Rules
- Concatenating all "text" fields MUST exactly equal the translation string
- Use [] for grammar words (the, a, of) with no Chinese equivalent
- Spaces MUST be separate parts: {"text": " ", "segmentIds": []}
- Keep phrases together when mapping to one segment

## Example
Input:
{
  "translation": "Do you like Chinese food?",
  "segments": [
    {"id": 0, "token": "你"},
    {"id": 1, "token": "喜欢"},
    {"id": 2, "token": "中国"},
    {"id": 3, "token": "菜"},
    {"id": 4, "token": "吗"},
    {"id": 5, "token": "？"}
  ]
}

Output:
{
  "translationParts": [
    {"text": "Do", "segmentIds": [4]},
    {"text": " ", "segmentIds": []},
    {"text": "you", "segmentIds": [0]},
    {"text": " ", "segmentIds": []},
    {"text": "like", "segmentIds": [1]},
    {"text": " ", "segmentIds": []},
    {"text": "Chinese", "segmentIds": [2]},
    {"text": " ", "segmentIds": []},
    {"text": "food", "segmentIds": [3]},
    {"text": "?", "segmentIds": [5]}
  ]
}`;
```

#### New Functions to Add

```typescript
// Timeout constants
const SEGMENTATION_TIMEOUT_MS = 90_000;  // 90 seconds
const ALIGNMENT_TIMEOUT_MS = 45_000;     // 45 seconds

/**
 * Stage 1: Stream segmentation with throughput-optimized routing
 */
export async function streamSegmentation(sentence: string): Promise<Response> {
  const model = config.openrouter.segmentationModel || config.openrouter.model;
  
  const response = await fetch(`${config.openrouter.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.openrouter.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://hanzilens.com',
      'X-Title': 'HanziLens',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: SEGMENTATION_PROMPT },
        { role: 'user', content: sentence },
      ],
      stream: true,
      response_format: { type: 'json_object' },
      provider: {
        sort: 'throughput',  // Route to highest throughput provider
      },
    }),
    signal: AbortSignal.timeout(SEGMENTATION_TIMEOUT_MS),
  });
  
  return response;
}

/**
 * Stage 2: Get translation alignment (non-streaming)
 * Returns null on failure (graceful degradation)
 */
export async function getTranslationAlignment(
  translation: string,
  segments: Array<{ id: number; token: string }>
): Promise<{ translationParts: Array<{ text: string; segmentIds: number[] }> } | null> {
  const model = config.openrouter.alignmentModel || config.openrouter.model;
  
  try {
    const response = await fetch(`${config.openrouter.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openrouter.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hanzilens.com',
        'X-Title': 'HanziLens',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: ALIGNMENT_PROMPT },
          { role: 'user', content: JSON.stringify({ translation, segments }) },
        ],
        stream: false,
        response_format: { type: 'json_object' },
        provider: {
          sort: 'throughput',
        },
      }),
      signal: AbortSignal.timeout(ALIGNMENT_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn('Alignment request failed:', response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    const result = JSON.parse(content);
    
    // Validate translationParts exists and is array
    if (!result.translationParts || !Array.isArray(result.translationParts)) {
      return null;
    }
    
    // Validate reconstruction
    const reconstructed = result.translationParts.map((p: any) => p.text).join('');
    if (reconstructed !== translation) {
      console.warn('Alignment reconstruction mismatch');
      return null;
    }

    return result;
  } catch (error) {
    console.warn('Alignment failed:', error);
    return null;
  }
}
```

### 3. `src/routes/parse.ts`

The main changes:

1. **Replace `streamParse()` with `streamSegmentation()`**
2. **After streaming completes, call `getTranslationAlignment()`**
3. **Append translationParts to the response before closing**

Key implementation detail - modify `streamResponseWithCorrection()` to:
1. Collect `translation` and `segments` as they stream
2. Return these values so Stage 2 can use them
3. After streaming segments, call Stage 2 and append result

```typescript
async function streamResponseWithCorrection(
  aiResponse: Response,
  req: Request,
  res: ExpressResponse,
  pinyinMap: PinyinMap
): Promise<{ translation: string; segments: Array<{ id: number; token: string }> } | null> {
  // ... existing streaming logic ...
  
  // Collect translation and segments during streaming
  // Return them for Stage 2
}

router.post('/parse', async (req, res) => {
  const sentence = req.validatedText!;
  
  // Build pinyin map (parallel with Stage 1, ~5ms)
  const pinyinMap = buildPinyinMap(sentence);
  
  // Stage 1: Stream segmentation
  const segmentationResponse = await streamSegmentation(sentence);
  const result = await streamResponseWithCorrection(segmentationResponse, req, res, pinyinMap);
  
  if (result) {
    // Stage 2: Get alignment (after Stage 1 completes)
    const alignment = await getTranslationAlignment(
      result.translation,
      result.segments.map(s => ({ id: s.id, token: s.token }))
    );
    
    if (alignment) {
      // Append translationParts to stream
      const translationPartsJson = JSON.stringify(alignment.translationParts);
      res.write(`data: {"choices":[{"delta":{"content":"${','}"}}]}\n`);
      res.write(`data: {"choices":[{"delta":{"content":"${'"translationParts":' + translationPartsJson + '}'}"}}]}\n`);
    }
  }
  
  res.write('data: [DONE]\n');
  res.end();
});
```

**Note**: The streaming JSON handling is complex. The current implementation uses a state machine in `processStreamBuffer()`. For Stage 2 appending, we need to:
1. Hold off on closing the JSON object `}` until after Stage 2
2. Or append translationParts as a separate SSE message that the client merges

The simplest approach: Modify the streaming to NOT emit the closing `}` of the main JSON object, then append `,"translationParts":[...]}` after Stage 2.

### 4. `src/routes/eval.ts`

Update the eval endpoint to use the two-stage pipeline:

```typescript
async function parseViaEndpoint(
  serverUrl: string,
  modelId: string,
  sentence: string,
  provider?: string
): Promise<{ segments: EvalSegment[]; translation: string; translationParts: ...; usage: TokenUsage }> {
  // Stage 1: Segmentation
  const stage1Result = await callSegmentation(sentence, modelId, provider);
  
  // Apply pinyin correction
  const correctedSegments = applyPinyinCorrection(sentence, stage1Result.segments);
  
  // Stage 2: Alignment
  const alignment = await callAlignment(
    stage1Result.translation,
    correctedSegments.map(s => ({ id: s.id, token: s.token }))
  );
  
  return {
    segments: correctedSegments,
    translation: stage1Result.translation,
    translationParts: alignment?.translationParts || [],
    usage: stage1Result.usage,
  };
}
```

### 5. `.env.example`

Add documentation:

```bash
# OpenRouter Configuration

# API Key (required)
OPENROUTER_API_KEY=sk-or-...

# Two-Stage Pipeline Models
# Stage 1: Segmentation (fast, good at Chinese)
OPENROUTER_SEGMENTATION_MODEL=qwen/qwen3-30b-a3b-instruct

# Stage 2: Translation Alignment (better at alignment)
OPENROUTER_ALIGNMENT_MODEL=xiaomi/mimo-v2-flashfree

# Legacy single model (deprecated, for backward compatibility)
# If set and stage models not set, will be used for both stages
OPENROUTER_MODEL=

# Vision model for image OCR
OPENROUTER_VISION_MODEL=qwen/qwen3-vl-32b-instruct
```

---

## OpenRouter Provider Routing

Instead of hardcoding providers, use OpenRouter's automatic routing:

```typescript
provider: {
  sort: 'throughput',  // Routes to highest throughput provider automatically
}
```

OpenRouter supports:
- `sort: "throughput"` - Prioritize highest tokens/second
- `sort: "latency"` - Prioritize lowest latency
- `sort: "price"` - Prioritize lowest cost (default with load balancing)

You can also use model suffixes:
- `qwen/qwen3-30b-a3b-instruct:nitro` - Shortcut for `sort: "throughput"`
- `model-name:floor` - Shortcut for `sort: "price"`

---

## Testing Checklist

After implementation:

1. **Unit Tests**
   - [ ] `npm test` passes
   - [ ] New functions have proper error handling

2. **Manual Testing**
   - [ ] Basic sentence: "你好吗？" works
   - [ ] Complex sentence with polyphonic chars: "他了解了情况"
   - [ ] Sentence with proper nouns: "北京是中国的首都"
   - [ ] Image upload still works (uses two-stage after OCR)

3. **Stage 2 Failure Testing**
   - [ ] Set very short timeout (1s) and verify graceful degradation
   - [ ] Verify segments still display without translationParts

4. **Eval Suite**
   - [ ] Run `npm run eval` with new pipeline
   - [ ] Compare pinyin accuracy (should be same or better)
   - [ ] Compare translationParts validity (should improve)

5. **Performance Testing**
   - [ ] Measure Stage 1 latency with Qwen
   - [ ] Measure Stage 2 latency with MiMo
   - [ ] Compare total time vs single-model baseline

---

## Potential Gotchas

1. **Streaming JSON Modification**
   The current `processStreamBuffer()` in `parse.ts` is a complex state machine. Modifying it to support appending translationParts requires careful handling of the JSON structure.

2. **Race Conditions**
   Ensure Stage 2 only starts after Stage 1 fully completes and the translation/segments are extracted.

3. **Error Handling**
   Stage 2 failure should be silent (logged but not thrown). The user should still get their segments.

4. **Backward Compatibility**
   If only `OPENROUTER_MODEL` is set, fall back to single-model behavior.

5. **Eval Endpoint**
   The eval endpoint returns both `rawPinyin` and `correctedPinyin`. Ensure this still works with two-stage.

---

## Summary

| Stage | Model | Provider Routing | Timeout | Output |
|-------|-------|------------------|---------|--------|
| 1 | Qwen3 30B A3B | `sort: "throughput"` | 90s | translation, segments (streamed) |
| Parallel | pinyin-pro + CC-CEDICT | N/A | ~5ms | PinyinMap |
| 2 | MiMo V2 Flash | `sort: "throughput"` | 45s | translationParts (appended) |

**Expected Benefits:**
- ~50% higher throughput on Stage 1 (75 tps vs 45 tps)
- Better alignment quality from specialized model
- Segments display faster (Stage 1 only)
- Graceful degradation if alignment fails

---

## Implementation Status: COMPLETED

The two-stage pipeline has been implemented. Key changes:

### Files Modified

1. **`src/config/index.ts`**
   - Added `segmentationModel` and `alignmentModel` config fields
   - Added helper functions: `getSegmentationModel()`, `getAlignmentModel()`, `isTwoStageConfigured()`
   - Updated `validateConfig()` to support two-stage or single-model config

2. **`src/services/ai.ts`**
   - Added `SEGMENTATION_PROMPT` (~60 lines, translation + segments only)
   - Added `ALIGNMENT_PROMPT` (~45 lines, translationParts mapping)
   - Added `streamSegmentation()` for Stage 1 streaming
   - Added `segmentationNonStreaming()` for eval endpoint
   - Added `getTranslationAlignment()` for Stage 2 (returns null on failure)

3. **`src/routes/parse.ts`**
   - Updated `streamResponseWithCorrection()` to return captured data for Stage 2
   - Updated route handler to use two-stage pipeline
   - Stage 2 sends `translationParts` as separate SSE event: `{"type":"translationParts","data":[...]}`

4. **`src/routes/eval.ts`**
   - Rewritten to use two-stage pipeline
   - Returns separate token usage for segmentation and alignment
   - Returns `alignmentValidation` metrics

5. **`frontend/src/hooks/useParse.ts`**
   - Added handling for `translationParts` SSE event type

6. **`tests/model-eval/types.ts`**
   - Added `TwoStageUsage`, `AlignmentValidation`, `AlignmentStats` types
   - Updated `EvalParseResponse` for new response format

7. **`tests/model-eval/evaluator.ts`**
   - Added `calculateAlignmentStats()` function
   - Updated to track alignment metrics
   - Updated `printSummary()` and `compareResults()` to show alignment quality

8. **`.env.example`**
   - Documented new environment variables

### SSE Protocol

The stream now includes a new event type for Stage 2:
```
# Stage 1 - normal streaming
data: {"choices":[{"delta":{"content":"..."}}]}

# Stage 2 - new event type (sent after Stage 1 completes)
data: {"type":"translationParts","data":[{"text":"Do","segmentIds":[4]},...]]}

# End
data: [DONE]
```

### Configuration

```bash
# Two-stage (recommended)
OPENROUTER_SEGMENTATION_MODEL=qwen/qwen3-30b-a3b-instruct
OPENROUTER_ALIGNMENT_MODEL=xiaomi/mimo-v2-flashfree

# OR single model fallback
OPENROUTER_MODEL=qwen/qwen3-30b-a3b-instruct
```

### Remaining Work

1. **Image parsing**: Still uses legacy single-model pipeline. Update to three-stage (OCR → Segmentation → Alignment) when ready.
2. **Testing**: Run eval suite with new pipeline to measure actual improvement.
