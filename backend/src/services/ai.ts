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

// Simple OCR-only prompt for vision model (Stage 1 of two-stage pipeline)
const VISION_OCR_PROMPT = `Extract all Chinese text visible in this image.

Rules:
- Include ALL Chinese text you can see
- Preserve natural reading order (top-to-bottom, left-to-right)
- Include punctuation if present
- If multiple text regions exist, separate them with spaces

Return a JSON object with exactly one field:
{"text": "<extracted Chinese text>"}

If no Chinese text is found, return: {"text": ""}`;

// Regex to match Chinese characters (CJK Unified Ideographs)
const CHINESE_CHAR_REGEX = /[\u4e00-\u9fff]/g;

/**
 * Validate OCR-extracted text has sufficient Chinese content
 */
function validateOcrText(text: string): { valid: boolean; error?: string } {
  const chineseChars = text.match(CHINESE_CHAR_REGEX) || [];
  if (chineseChars.length < config.ocr.minChineseChars) {
    return { valid: false, error: 'Could not extract sufficient Chinese text from image' };
  }
  return { valid: true };
}

/**
 * OCR result from vision model
 */
interface OcrResult {
  text: string;
}

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
        // Use Google Vertex for optimal throughput with Qwen models
        provider: {
          only: ['google-vertex'],
        },
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
 * Extract Chinese text from an image using vision model (OCR only).
 * Non-streaming request for speed.
 * 
 * @param imageDataUrl - Base64 data URL (e.g., "data:image/jpeg;base64,...")
 * @returns Extracted Chinese text (validated and truncated)
 * @throws Error if OCR fails or validation fails
 */
async function extractTextFromImage(imageDataUrl: string): Promise<string> {
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
                text: VISION_OCR_PROMPT,
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
        stream: false, // Non-streaming for OCR stage
        response_format: { type: 'json_object' },
        // Prioritize Fireworks (highest throughput provider at ~77 tps)
        provider: {
          order: ['fireworks'],
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`OpenRouter Vision API error (${response.status}):`, errorBody);
      throw new Error('AI vision service temporarily unavailable');
    }

    // Parse the response
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in vision model response');
    }

    // Parse the JSON content from the model
    let extractedText: string;
    try {
      const ocrResult: OcrResult = JSON.parse(content);
      extractedText = (ocrResult.text || '').trim();
    } catch {
      // Fallback: try to extract text field using regex for malformed JSON
      const textMatch = content.match(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      if (textMatch) {
        // Unescape the JSON string
        extractedText = JSON.parse(`"${textMatch[1]}"`).trim();
        console.warn('OCR JSON was malformed, extracted text via regex');
      } else {
        console.error('Failed to parse OCR JSON response:', content);
        throw new Error('Could not extract sufficient Chinese text from image');
      }
    }

    // Validate the extracted text
    const validation = validateOcrText(extractedText);
    if (!validation.valid) {
      throw new Error(validation.error || 'Could not extract sufficient Chinese text from image');
    }

    // Truncate to max length if needed
    const truncatedText = extractedText.slice(0, config.ocr.maxTextLength);

    return truncatedText;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('AI vision request timed out');
    }
    throw error;
  }
}

/**
 * Two-stage image parsing:
 * 1. OCR: Extract Chinese text from image (vision model, non-streaming)
 * 2. Parse: Segment and analyze text (text model, streaming)
 * 
 * @param imageDataUrl - Base64 data URL (e.g., "data:image/jpeg;base64,...")
 * @returns Object with streaming response and extracted text (for pinyin correction)
 */
export async function streamParseImage(imageDataUrl: string): Promise<{
  response: Response;
  extractedText: string;
}> {
  // Stage 1: OCR - extract text from image
  const extractedText = await extractTextFromImage(imageDataUrl);
  
  // Stage 2: Parse - use text model for linguistic analysis
  const response = await streamParse(extractedText);
  
  return { response, extractedText };
}

/**
 * Token usage information from OpenRouter
 */
export interface TokenUsage {
  prompt: number;
  completion: number;
  total: number;
}

/**
 * Result from non-streaming parse
 */
export interface ParseNonStreamingResult {
  result: {
    translation: string;
    segments: Array<{
      id: number;
      token: string;
      pinyin: string;
      definition: string;
    }>;
    translationParts: Array<{
      text: string;
      segmentIds: number[];
    }>;
  };
  model: string;
  usage: TokenUsage;
}

/**
 * Non-streaming parse for evaluation purposes.
 * 
 * Allows model override and returns token usage.
 * Used by the /eval/parse endpoint for model evaluation.
 * 
 * @param sentence - Chinese text to parse
 * @param modelOverride - Optional model ID to use instead of configured model
 * @param providerOverride - Optional provider slug (e.g., 'fireworks', 'together')
 * @returns Parse result with model info and token usage
 */
export async function parseNonStreaming(
  sentence: string,
  modelOverride?: string,
  providerOverride?: string
): Promise<ParseNonStreamingResult> {
  const model = modelOverride || config.openrouter.model;
  
  if (!config.openrouter.apiKey) {
    throw new Error('OPENROUTER_API_KEY not set');
  }
  
  if (!model) {
    throw new Error('No model specified and OPENROUTER_MODEL not set');
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
        'X-Title': 'HanziLens Model Eval',
      },
      body: JSON.stringify({
        model,
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
        stream: false,
        response_format: { type: 'json_object' },
        // Add provider routing if specified (use 'only' for strict provider selection)
        ...(providerOverride && {
          provider: {
            only: [providerOverride],
          },
        }),
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`OpenRouter API error (${response.status}):`, errorBody);
      throw new Error(`Model request failed: ${response.status}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from model');
    }

    // Parse the JSON response
    const result = JSON.parse(content);

    // Validate basic structure
    if (!result.segments || !Array.isArray(result.segments)) {
      throw new Error('Invalid response: missing segments array');
    }

    return {
      result,
      model,
      usage: {
        prompt: data.usage?.prompt_tokens ?? 0,
        completion: data.usage?.completion_tokens ?? 0,
        total: data.usage?.total_tokens ?? 0,
      },
    };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Model request timed out');
    }
    throw error;
  }
}
