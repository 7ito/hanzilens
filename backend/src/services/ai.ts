import { config } from '../config/index.js';

// Request timeout for AI calls (90 seconds)
const AI_TIMEOUT_MS = 90_000;

const SYSTEM_PROMPT = `You are a Chinese language segmentation assistant. Your task is to break down Chinese sentences into individual words (词语) and provide linguistic information for each, along with alignment to the English translation.

## Input
You will receive a Chinese sentence.

## Output
Return a JSON object with these fields IN THIS EXACT ORDER:
1. "translation": A natural English translation of the full sentence
2. "segments": An array of word segments with unique IDs
3. "translationParts": An array of translation fragments with segment references

IMPORTANT: Output segments BEFORE translationParts to enable streaming display.

## Segment Format
Each segment must have:
- "id": A unique integer starting from 0, incrementing for each segment
- "token": The original Chinese text
- "pinyin": Pronunciation with tone numbers (1-5), spaces between syllables
- "definition": The contextual meaning in this sentence (concise, 1-5 words)

## Translation Parts Format
Break the English translation into parts that map back to Chinese segments:
- "text": The English text fragment (word, phrase, or punctuation)
- "segmentIds": Array of segment IDs this text corresponds to

Rules for translationParts:
- A part can reference multiple segments (e.g., "11th" references both 第 and 11)
- A part can reference no segments (segmentIds: []) for English grammar words like "the", "of", "a"
- Multiple parts can reference the same segment if needed
- Spaces should be separate parts with empty segmentIds: {"text": " ", "segmentIds": []}
- Concatenating all parts' text must exactly equal the translation string
- Keep multi-word English phrases together when they map to one Chinese segment

## Rules

### Pinyin Format
- Use tone numbers: ni3 hao3, bu4 shi4, ma5
- Use u: for ü: nu:3, lü4
- Separate syllables with spaces: zhong1 guo2 (not zhong1guo2)
- No hyphens or special characters

### Segmentation
- Segment into natural word units (词语), not individual characters
- Keep grammatical particles attached appropriately: 了, 的, 吗, 吧
- Proper nouns and titles stay as one segment (e.g., 《异度觉醒》)

### Special Cases
- Punctuation: {"id": N, "token": "。", "pinyin": "", "definition": ""}
- Numbers: {"id": N, "token": "2024", "pinyin": "", "definition": ""}
- English: {"id": N, "token": "NBA", "pinyin": "", "definition": ""}

## Example 1 (Simple)

Input: 你喜欢吃中国菜吗？

Output:
{
  "translation": "Do you like eating Chinese food?",
  "segments": [
    {"id": 0, "token": "你", "pinyin": "ni3", "definition": "you"},
    {"id": 1, "token": "喜欢", "pinyin": "xi3 huan5", "definition": "like"},
    {"id": 2, "token": "吃", "pinyin": "chi1", "definition": "eat"},
    {"id": 3, "token": "中国", "pinyin": "zhong1 guo2", "definition": "Chinese"},
    {"id": 4, "token": "菜", "pinyin": "cai4", "definition": "food"},
    {"id": 5, "token": "吗", "pinyin": "ma5", "definition": "(question)"},
    {"id": 6, "token": "？", "pinyin": "", "definition": ""}
  ],
  "translationParts": [
    {"text": "Do", "segmentIds": [5]},
    {"text": " ", "segmentIds": []},
    {"text": "you", "segmentIds": [0]},
    {"text": " ", "segmentIds": []},
    {"text": "like", "segmentIds": [1]},
    {"text": " ", "segmentIds": []},
    {"text": "eating", "segmentIds": [2]},
    {"text": " ", "segmentIds": []},
    {"text": "Chinese", "segmentIds": [3]},
    {"text": " ", "segmentIds": []},
    {"text": "food", "segmentIds": [4]},
    {"text": "?", "segmentIds": [6]}
  ]
}

## Example 2 (Complex with reordering and multi-segment mapping)

Input: 这是第11集。

Output:
{
  "translation": "This is the 11th episode.",
  "segments": [
    {"id": 0, "token": "这", "pinyin": "zhe4", "definition": "this"},
    {"id": 1, "token": "是", "pinyin": "shi4", "definition": "is"},
    {"id": 2, "token": "第", "pinyin": "di4", "definition": "ordinal prefix"},
    {"id": 3, "token": "11", "pinyin": "", "definition": ""},
    {"id": 4, "token": "集", "pinyin": "ji2", "definition": "episode"},
    {"id": 5, "token": "。", "pinyin": "", "definition": ""}
  ],
  "translationParts": [
    {"text": "This", "segmentIds": [0]},
    {"text": " ", "segmentIds": []},
    {"text": "is", "segmentIds": [1]},
    {"text": " ", "segmentIds": []},
    {"text": "the", "segmentIds": []},
    {"text": " ", "segmentIds": []},
    {"text": "11th", "segmentIds": [2, 3]},
    {"text": " ", "segmentIds": []},
    {"text": "episode", "segmentIds": [4]},
    {"text": ".", "segmentIds": [5]}
  ]
}`;

const VISION_PROMPT = `You are a Chinese language OCR and segmentation assistant. Your task is to extract Chinese text from an image and segment it into individual words.

## Input
You will receive an image that may contain Chinese text.

## Task
1. Extract ALL Chinese text visible in the image
2. If multiple text regions exist, concatenate them in natural reading order (top-to-bottom, left-to-right)
3. Segment the extracted text into words with pinyin and definitions
4. Map the segments to an English translation

## Output Format
Return a JSON object with these fields IN THIS EXACT ORDER:
1. "translation": A natural English translation of the extracted text
2. "segments": An array of word segments with unique IDs
3. "translationParts": An array of translation fragments with segment references

## Segment Format
Each segment must have:
- "id": A unique integer starting from 0
- "token": The original Chinese text
- "pinyin": Pronunciation with tone numbers (1-5), spaces between syllables
- "definition": The contextual meaning (concise, 1-5 words)

## Translation Parts Format
- "text": The English text fragment
- "segmentIds": Array of segment IDs this text corresponds to

## Pinyin Rules
- Use tone numbers: ni3 hao3, bu4 shi4, ma5
- Use u: for ü: nu:3, lü4
- Separate syllables with spaces

## Special Cases
- Punctuation: {"id": N, "token": "。", "pinyin": "", "definition": ""}
- Numbers: {"id": N, "token": "2024", "pinyin": "", "definition": ""}
- If NO Chinese text is found, return: {"error": "no_chinese_text", "message": "No Chinese text found in image"}

## Example Output
{
  "translation": "Hello",
  "segments": [
    {"id": 0, "token": "你好", "pinyin": "ni3 hao3", "definition": "hello"}
  ],
  "translationParts": [
    {"text": "Hello", "segmentIds": [0]}
  ]
}`;

/**
 * Validate that OpenRouter is configured for text parsing
 */
export function isConfigured(): boolean {
  return !!(config.openrouter.apiKey && config.openrouter.model);
}

/**
 * Validate that OpenRouter is configured for vision/image parsing
 */
export function isVisionConfigured(): boolean {
  return !!(config.openrouter.apiKey && config.openrouter.visionModel);
}

/**
 * Get configuration status message for text parsing
 */
export function getConfigStatus(): string {
  const issues: string[] = [];
  if (!config.openrouter.apiKey) issues.push('OPENROUTER_API_KEY not set');
  if (!config.openrouter.model) issues.push('OPENROUTER_MODEL not set');
  return issues.length > 0 ? issues.join(', ') : 'configured';
}

/**
 * Get configuration status message for vision parsing
 */
export function getVisionConfigStatus(): string {
  const issues: string[] = [];
  if (!config.openrouter.apiKey) issues.push('OPENROUTER_API_KEY not set');
  if (!config.openrouter.visionModel) issues.push('OPENROUTER_VISION_MODEL not set');
  return issues.length > 0 ? issues.join(', ') : 'configured';
}

/**
 * Stream a chat completion from OpenRouter.
 * Returns a ReadableStream that yields SSE chunks.
 */
export async function streamParse(sentence: string): Promise<Response> {
  if (!isConfigured()) {
    throw new Error(`OpenRouter not configured: ${getConfigStatus()}`);
  }

  // Set up timeout for the request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

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
        model: config.openrouter.model,
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: sentence,
          },
        ],
        stream: true,
        // Request JSON response format (supported by most models)
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      // Log full error for debugging, but don't expose to client
      console.error(`OpenRouter API error (${response.status}):`, errorBody);
      throw new Error('AI service temporarily unavailable');
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI request timed out');
    }
    throw error;
  }
}

/**
 * Stream a vision chat completion from OpenRouter for image OCR.
 * Returns a ReadableStream that yields SSE chunks.
 * 
 * @param imageDataUrl - Base64 data URL (e.g., "data:image/jpeg;base64,...")
 */
export async function streamParseImage(imageDataUrl: string): Promise<Response> {
  if (!isVisionConfigured()) {
    throw new Error(`OpenRouter vision not configured: ${getVisionConfigStatus()}`);
  }

  // Set up timeout for the request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

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
        model: config.openrouter.visionModel,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: VISION_PROMPT,
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl,
                },
              },
            ],
          },
        ],
        stream: true,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      // Log full error for debugging, but don't expose to client
      console.error(`OpenRouter Vision API error (${response.status}):`, errorBody);
      throw new Error('AI vision service temporarily unavailable');
    }

    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI vision request timed out');
    }
    throw error;
  }
}
