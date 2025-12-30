import { config } from '../config/index.js';

const SYSTEM_PROMPT = `You are a Chinese language segmentation assistant. Your task is to break down Chinese sentences into individual words (词语) and provide linguistic information for each.

## Input
You will receive a Chinese sentence.

## Output
Return a JSON object with:
1. "translation": A natural English translation of the full sentence
2. "segments": An array of word segments

## Segment Format
Each segment must have:
- "token": The original Chinese text
- "pinyin": Pronunciation with tone numbers (1-5), spaces between syllables
- "definition": The contextual meaning in this sentence (concise, 1-5 words)

## Rules

### Pinyin Format
- Use tone numbers: ni3 hao3, bu4 shi4, ma5
- Use u: for ü: nu:3, lü4
- Separate syllables with spaces: zhong1 guo2 (not zhong1guo2)
- No hyphens or special characters

### Segmentation
- Segment into natural word units (词语), not individual characters
- Keep grammatical particles attached appropriately: 了, 的, 吗, 吧
- Proper nouns stay as one segment

### Special Cases
- Punctuation: {"token": "。", "pinyin": "", "definition": ""}
- Numbers: {"token": "2024", "pinyin": "", "definition": ""}
- English: {"token": "NBA", "pinyin": "", "definition": ""}

## Example

Input: 你喜欢吃中国菜吗？

Output:
{
  "translation": "Do you like eating Chinese food?",
  "segments": [
    {"token": "你", "pinyin": "ni3", "definition": "you"},
    {"token": "喜欢", "pinyin": "xi3 huan5", "definition": "like"},
    {"token": "吃", "pinyin": "chi1", "definition": "eat"},
    {"token": "中国", "pinyin": "zhong1 guo2", "definition": "Chinese"},
    {"token": "菜", "pinyin": "cai4", "definition": "food"},
    {"token": "吗", "pinyin": "ma5", "definition": "(question)"},
    {"token": "？", "pinyin": "", "definition": ""}
  ]
}`;

/**
 * Validate that OpenRouter is configured
 */
export function isConfigured(): boolean {
  return !!(config.openrouter.apiKey && config.openrouter.model);
}

/**
 * Get configuration status message
 */
export function getConfigStatus(): string {
  const issues: string[] = [];
  if (!config.openrouter.apiKey) issues.push('OPENROUTER_API_KEY not set');
  if (!config.openrouter.model) issues.push('OPENROUTER_MODEL not set');
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
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenRouter API error (${response.status}): ${errorBody}`);
  }

  return response;
}
