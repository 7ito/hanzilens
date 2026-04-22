import { GoogleAuth } from 'google-auth-library';
import { imageSize as getImageSize } from 'image-size';
import { config } from '../config/index.js';
import { orderOcrLines, type OcrReadingDirection } from './ocrOrder.js';
import { CHINESE_CHAR_REGEX_G } from '../utils/chinese.js';
import { ParseResponseSchema, type ValidatedParseResponse } from '../schemas/parse.js';
import { ZodError } from 'zod';

// Request timeout for AI calls (90 seconds)
const AI_TIMEOUT_MS = 90_000;

// Decoding settings
const TEMPERATURE = 0.2;
const GOOGLE_VISION_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

const SYSTEM_PROMPT = `You are a Chinese language segmentation assistant. Your task is to break down Chinese sentences into individual words (词语) and provide linguistic information for each, along with alignment to the English translation.

## Input
You will receive a Chinese target sentence.
You may also receive a context paragraph that comes before the target sentence.

When context is provided, it will appear like this:
Context:
<context text>

Target sentence:
<sentence>

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

### Context Usage
- Use the context only to disambiguate translation and definitions
- Do NOT segment, rewrite, or translate the context text
- Segment ONLY the target sentence

### Pinyin Format
- Use tone numbers: ni3 hao3, bu4 shi4, ma5
- Use u: for ü: nu:3, lü4
- Separate syllables with spaces: zhong1 guo2 (not zhong1guo2)
- No hyphens or special characters

### Segmentation
- Segment into natural word units (词语), not individual characters
- Keep grammatical particles attached appropriately: 了, 的, 吗, 吧
- Proper nouns and titles stay as one segment (e.g., 《异度觉醒》)

### Long/Noisy Inputs (OCR, typos, mixed scripts)
- Preserve original text exactly; do NOT correct typos or rewrite tokens
- Treat line breaks and major punctuation (。！？；:) as hard boundaries
- Keep word-level tokens (usually 1-3 characters) and avoid long merged phrases
- Avoid single-character tokens unless the character stands alone or is a particle
- Keep numbers, Latin words, and mixed alphanumerics as single tokens
- Preserve English words exactly in the translation; do not paraphrase them

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

/**
 * Validate OCR-extracted text has sufficient Chinese content
 */
function validateOcrText(text: string): { valid: boolean; error?: string } {
  const chineseChars = text.match(CHINESE_CHAR_REGEX_G) || [];
  if (chineseChars.length < config.ocr.minChineseChars) {
    return { valid: false, error: 'Could not extract sufficient Chinese text from image' };
  }
  return { valid: true };
}

function validateOcrLines(lines: OcrLine[]): { valid: boolean; error?: string } {
  const combinedText = lines.map((line) => line.text).join('');
  return validateOcrText(combinedText);
}

/**
 * OCR result from image OCR provider
 */
interface OcrLineBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface OcrLine {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  box: OcrLineBox;
  wordIds: string[];
  confidence?: number;
}

interface OcrWord {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  lineId: string;
  box: OcrLineBox;
  confidence?: number;
}

interface OcrResult {
  imageSize?: { width: number; height: number };
  text: string;
  readingDirection: OcrReadingDirection;
  lines: OcrLine[];
  words: OcrWord[];
}

interface OcrRawLine {
  id?: string | number;
  text?: string;
  box?: Partial<OcrLineBox>;
  confidence?: number;
}

interface OcrWordCandidate {
  id: string;
  text: string;
  trailingText: string;
  box: OcrLineBox;
  confidence?: number;
}

interface OcrLineCandidate {
  id: string;
  text: string;
  box: OcrLineBox;
  words: OcrWordCandidate[];
  confidence?: number;
}

interface GoogleVisionVertex {
  x?: number;
  y?: number;
}

interface GoogleVisionBoundingPoly {
  vertices?: GoogleVisionVertex[];
}

interface GoogleVisionDetectedBreak {
  type?: 'UNKNOWN' | 'SPACE' | 'SURE_SPACE' | 'EOL_SURE_SPACE' | 'HYPHEN' | 'LINE_BREAK';
}

interface GoogleVisionTextProperty {
  detectedBreak?: GoogleVisionDetectedBreak;
}

interface GoogleVisionSymbol {
  text?: string;
  property?: GoogleVisionTextProperty;
}

interface GoogleVisionWord {
  symbols?: GoogleVisionSymbol[];
  boundingBox?: GoogleVisionBoundingPoly;
  confidence?: number;
}

interface GoogleVisionParagraph {
  words?: GoogleVisionWord[];
}

interface GoogleVisionBlock {
  paragraphs?: GoogleVisionParagraph[];
}

interface GoogleVisionPage {
  blocks?: GoogleVisionBlock[];
}

interface GoogleVisionFullTextAnnotation {
  text?: string;
  pages?: GoogleVisionPage[];
}

interface GoogleVisionError {
  message?: string;
}

interface GoogleVisionAnnotateImageResponse {
  error?: GoogleVisionError;
  fullTextAnnotation?: GoogleVisionFullTextAnnotation;
}

interface GoogleVisionAnnotateResponse {
  responses?: GoogleVisionAnnotateImageResponse[];
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeBox(
  box: Partial<OcrLineBox> | undefined,
  imageSize?: { width?: number; height?: number }
): OcrLineBox {
  let x = box?.x ?? 0;
  let y = box?.y ?? 0;
  let w = box?.w ?? 0;
  let h = box?.h ?? 0;

  const maxValue = Math.max(x, y, w, h);

  if (maxValue > 1.2) {
    if (imageSize?.width && imageSize?.height) {
      x /= imageSize.width;
      w /= imageSize.width;
      y /= imageSize.height;
      h /= imageSize.height;
    } else if (maxValue <= 100) {
      x /= 100;
      y /= 100;
      w /= 100;
      h /= 100;
    }
  }

  x = clamp01(x);
  y = clamp01(y);
  w = clamp01(w);
  h = clamp01(h);

  if (w <= 0) w = 0.05;
  if (h <= 0) h = 0.04;

  if (x + w > 1) w = Math.max(0.01, 1 - x);
  if (y + h > 1) h = Math.max(0.01, 1 - y);

  return { x, y, w, h };
}

function buildFallbackBoxes(count: number): OcrLineBox[] {
  const total = Math.max(1, count);
  const gutter = 0.03;
  const usableHeight = 1 - gutter * 2;
  const lineHeight = usableHeight / total;

  return Array.from({ length: total }, (_, index) => ({
    x: 0.05,
    y: gutter + index * lineHeight,
    w: 0.9,
    h: Math.min(0.12, lineHeight * 0.8),
  }));
}

function trailingTextFromBreakType(breakType: GoogleVisionDetectedBreak['type'] | undefined): string {
  if (breakType === 'SPACE' || breakType === 'SURE_SPACE' || breakType === 'EOL_SURE_SPACE') {
    return ' ';
  }

  if (breakType === 'HYPHEN') {
    return '-';
  }

  return '';
}

function normalizeTrailingText(trailingText: string, isLastWord: boolean): string {
  if (!trailingText) return '';
  if (isLastWord && /^\s+$/.test(trailingText)) return '';
  return trailingText;
}

function buildLineText(words: OcrWordCandidate[]): string {
  return words
    .map((word, index) => word.text + normalizeTrailingText(word.trailingText, index === words.length - 1))
    .join('');
}

function buildOcrResultFromLineCandidates(
  lineCandidates: OcrLineCandidate[],
  imageSize?: { width?: number; height?: number }
): OcrResult {
  const ordered = orderOcrLines(lineCandidates);
  const orderedLineCandidates = ordered.lines.filter(
    (lineCandidate) => lineCandidate.words.length > 0 && buildLineText(lineCandidate.words).trim().length > 0
  );
  const lines: OcrLine[] = [];
  const words: OcrWord[] = [];
  const textParts: string[] = [];
  let cursor = 0;

  orderedLineCandidates.forEach((lineCandidate, lineIndex) => {
    const lineText = buildLineText(lineCandidate.words);

    const lineStartOffset = cursor;
    const wordIds: string[] = [];
    let lineCursor = 0;

    lineCandidate.words.forEach((wordCandidate, wordIndex) => {
      const startOffset = lineStartOffset + lineCursor;
      const endOffset = startOffset + wordCandidate.text.length;
      const wordId = wordCandidate.id;

      words.push({
        id: wordId,
        text: wordCandidate.text,
        startOffset,
        endOffset,
        lineId: lineCandidate.id,
        box: wordCandidate.box,
        ...(wordCandidate.confidence !== undefined ? { confidence: wordCandidate.confidence } : {}),
      });

      wordIds.push(wordId);
      lineCursor += wordCandidate.text.length;
      lineCursor += normalizeTrailingText(
        wordCandidate.trailingText,
        wordIndex === lineCandidate.words.length - 1
      ).length;
    });

    const endOffset = lineStartOffset + lineText.length;

    lines.push({
      id: lineCandidate.id,
      text: lineText,
      startOffset: lineStartOffset,
      endOffset,
      box: normalizeBox(lineCandidate.box, imageSize),
      wordIds,
      ...(lineCandidate.confidence !== undefined ? { confidence: lineCandidate.confidence } : {}),
    });

    textParts.push(lineText);
    cursor = endOffset;

    if (lineIndex < orderedLineCandidates.length - 1) {
      textParts.push('\n');
      cursor += 1;
    }
  });

  return {
    imageSize: imageSize?.width && imageSize?.height
      ? { width: imageSize.width, height: imageSize.height }
      : undefined,
    text: textParts.join(''),
    readingDirection: ordered.direction,
    lines,
    words,
  };
}

function normalizeOcrLines(
  rawLines: OcrRawLine[],
  imageSize?: { width?: number; height?: number }
): OcrResult {
  const fallbackBoxes = buildFallbackBoxes(rawLines.length || 1);

  const lines: OcrLineCandidate[] = [];

  rawLines.forEach((rawLine, index) => {
    const text = (rawLine.text || '').trim();
    if (!text) return;

    const id = rawLine.id ? String(rawLine.id) : `line-${index + 1}`;
    const box = normalizeBox(rawLine.box ?? fallbackBoxes[index], imageSize);

    const line: OcrLineCandidate = {
      id,
      text,
      box,
      words: [
        {
          id: `${id}-word-1`,
          text,
          trailingText: '',
          box,
          ...(rawLine.confidence !== undefined ? { confidence: rawLine.confidence } : {}),
        },
      ],
      ...(rawLine.confidence !== undefined ? { confidence: rawLine.confidence } : {}),
    };

    lines.push(line);
  });

  return buildOcrResultFromLineCandidates(lines, imageSize);
}

function hasGoogleVisionCredentials(): boolean {
  return !!(
    config.googleVision.apiKey
    || config.googleVision.credentialsJson
    || config.googleVision.credentialsPath
  );
}

let googleVisionAuth: GoogleAuth | null = null;

function getGoogleVisionAuth(): GoogleAuth {
  if (googleVisionAuth) {
    return googleVisionAuth;
  }

  if (config.googleVision.credentialsJson) {
    let credentials: Record<string, unknown>;

    try {
      credentials = JSON.parse(config.googleVision.credentialsJson) as Record<string, unknown>;
    } catch (error) {
      console.error('Failed to parse GOOGLE_CLOUD_VISION_CREDENTIALS_JSON:', error);
      throw new Error('AI service not configured');
    }

    googleVisionAuth = new GoogleAuth({
      credentials,
      scopes: [GOOGLE_VISION_SCOPE],
    });

    return googleVisionAuth;
  }

  googleVisionAuth = new GoogleAuth({ scopes: [GOOGLE_VISION_SCOPE] });
  return googleVisionAuth;
}

function parseImageDataUrl(imageDataUrl: string): { base64: string; buffer: Buffer } {
  const match = imageDataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image format. Expected base64 data URL (e.g., data:image/jpeg;base64,...)');
  }

  const base64 = match[1];
  return {
    base64,
    buffer: Buffer.from(base64, 'base64'),
  };
}

function getImageDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  const result = getImageSize(buffer);
  if (!result.width || !result.height) {
    return undefined;
  }

  return {
    width: result.width,
    height: result.height,
  };
}

function normalizeGoogleBoundingPoly(
  boundingPoly: GoogleVisionBoundingPoly | undefined,
  imageSize?: { width?: number; height?: number }
): OcrLineBox {
  const vertices = boundingPoly?.vertices ?? [];
  const xs = vertices.map((vertex) => vertex.x ?? 0);
  const ys = vertices.map((vertex) => vertex.y ?? 0);

  if (xs.length === 0 || ys.length === 0) {
    return normalizeBox(undefined, imageSize);
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  return normalizeBox(
    {
      x: minX,
      y: minY,
      w: Math.max(0, maxX - minX),
      h: Math.max(0, maxY - minY),
    },
    imageSize
  );
}

function mergeLineBoxes(a: OcrLineBox | null, b: OcrLineBox): OcrLineBox {
  if (!a) return b;

  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);

  return {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
  };
}

function getGoogleWordText(word: GoogleVisionWord): string {
  return (word.symbols ?? [])
    .map((symbol) => symbol.text ?? '')
    .join('')
    .trim();
}

function getGoogleWordBreakType(word: GoogleVisionWord): GoogleVisionDetectedBreak['type'] | undefined {
  const symbols = word.symbols ?? [];
  const lastSymbol = symbols[symbols.length - 1];
  return lastSymbol?.property?.detectedBreak?.type;
}

function shouldFlushLine(breakType: GoogleVisionDetectedBreak['type'] | undefined): boolean {
  return breakType === 'LINE_BREAK' || breakType === 'EOL_SURE_SPACE';
}

function extractLinesFromGoogleVision(
  annotation: GoogleVisionAnnotateImageResponse,
  imageSize?: { width?: number; height?: number }
): OcrResult {
  const lines: OcrLineCandidate[] = [];
  const pages = annotation.fullTextAnnotation?.pages ?? [];

  let currentWords: OcrWordCandidate[] = [];
  let currentBox: OcrLineBox | null = null;
  let confidenceSum = 0;
  let confidenceCount = 0;
  let lineCounter = 0;
  let wordCounter = 0;

  const flushCurrentLine = () => {
    const text = buildLineText(currentWords);
    if (!text.trim() || !currentBox || currentWords.length === 0) {
      currentWords = [];
      currentBox = null;
      confidenceSum = 0;
      confidenceCount = 0;
      return;
    }

    lines.push({
      id: `l${++lineCounter}`,
      text,
      box: currentBox,
      words: currentWords,
      ...(confidenceCount > 0 ? { confidence: confidenceSum / confidenceCount } : {}),
    });

    currentWords = [];
    currentBox = null;
    confidenceSum = 0;
    confidenceCount = 0;
  };

  for (const page of pages) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const wordText = getGoogleWordText(word);
          if (!wordText) continue;

          const breakType = getGoogleWordBreakType(word);
          const normalizedBox = normalizeGoogleBoundingPoly(word.boundingBox, imageSize);

          currentWords.push({
            id: `w${++wordCounter}`,
            text: wordText,
            trailingText: trailingTextFromBreakType(breakType),
            box: normalizedBox,
            ...(Number.isFinite(word.confidence) ? { confidence: word.confidence as number } : {}),
          });

          currentBox = mergeLineBoxes(
            currentBox,
            normalizedBox
          );

          if (Number.isFinite(word.confidence)) {
            confidenceSum += word.confidence as number;
            confidenceCount += 1;
          }

          if (shouldFlushLine(breakType)) {
            flushCurrentLine();
          }
        }

        flushCurrentLine();
      }
    }
  }

  flushCurrentLine();

  if (lines.length > 0) {
    return buildOcrResultFromLineCandidates(lines, imageSize);
  }

  const fallbackText = annotation.fullTextAnnotation?.text;
  if (typeof fallbackText === 'string' && fallbackText.trim()) {
    const rawLines = fallbackText
      .split(/\n+/)
      .map((text, index) => ({ id: `l${index + 1}`, text }));

    return normalizeOcrLines(rawLines, imageSize);
  }

  return {
    imageSize: imageSize?.width && imageSize?.height
      ? { width: imageSize.width, height: imageSize.height }
      : undefined,
    text: '',
    readingDirection: 'horizontal',
    lines: [],
    words: [],
  };
}

async function getGoogleVisionRequestInit(): Promise<{ url: string; headers: HeadersInit }> {
  if (config.googleVision.apiKey) {
    return {
      url: `${config.googleVision.endpoint}?key=${encodeURIComponent(config.googleVision.apiKey)}`,
      headers: {
        'Content-Type': 'application/json',
      },
    };
  }

  const auth = getGoogleVisionAuth();
  const client = await auth.getClient();
  const requestHeaders = await client.getRequestHeaders(config.googleVision.endpoint);

  return {
    url: config.googleVision.endpoint,
    headers: {
      ...requestHeaders,
      'Content-Type': 'application/json',
    },
  };
}

/**
 * Validate that OpenRouter is configured for text parsing
 */
export function isConfigured(): boolean {
  return !!(config.openrouter.apiKey && config.openrouter.model);
}

/**
 * Validate that OCR is configured for image parsing
 */
export function isVisionConfigured(): boolean {
  return hasGoogleVisionCredentials();
}

/**
 * Get configuration status message for text parsing
 */
/**
 * Get configuration status for server-side logging only.
 * Never expose the output of these functions to API clients.
 */
export function getConfigStatus(): string {
  const issues: string[] = [];
  if (!config.openrouter.apiKey) issues.push('OPENROUTER_API_KEY not set');
  if (!config.openrouter.model) issues.push('OPENROUTER_MODEL not set');
  return issues.length > 0 ? issues.join(', ') : 'configured';
}

export function getVisionConfigStatus(): string {
  const issues: string[] = [];
  if (!config.googleVision.apiKey && !config.googleVision.credentialsJson && !config.googleVision.credentialsPath) {
    issues.push('Google Cloud Vision credentials not set');
  }
  return issues.length > 0 ? issues.join(', ') : 'configured';
}

/**
 * Stream a chat completion from OpenRouter.
 * Returns a ReadableStream that yields SSE chunks.
 */
export async function streamParse(sentence: string, context?: string): Promise<Response> {
  if (!isConfigured()) {
    console.error(`OpenRouter not configured: ${getConfigStatus()}`);
    throw new Error('AI service not configured');
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
            content: context
              ? `Context:\n${context}\n\nTarget sentence:\n${sentence}`
              : sentence,
          },
        ],
        stream: true,
        response_format: { type: 'json_object' },
        temperature: TEMPERATURE,
        provider: {
          sort: 'throughput',
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
 * Extract text + layout from an image using Google Cloud Vision.
 *
 * @param imageDataUrl - Base64 data URL (e.g., "data:image/jpeg;base64,...")
 * @returns OCR result with canonical text, lines, words, and normalized boxes
 * @throws Error if OCR fails or validation fails
 */
async function extractLinesFromImage(imageDataUrl: string): Promise<OcrResult> {
  if (!isVisionConfigured()) {
    console.error(`Google Cloud Vision not configured: ${getVisionConfigStatus()}`);
    throw new Error('AI service not configured');
  }

  const { base64, buffer } = parseImageDataUrl(imageDataUrl);
  const imageSize = getImageDimensions(buffer);

  const requestBody = {
    requests: [
      {
        image: { content: base64 },
        features: [{ type: 'TEXT_DETECTION' }],
        imageContext: {
          languageHints: ['zh', 'zh-Hans', 'zh-Hant'],
        },
      },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const { url, headers } = await getGoogleVisionRequestInit();

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Google Cloud Vision API error (${response.status}):`, errorBody);
      throw new Error('AI vision service temporarily unavailable');
    }

    const data = await response.json() as GoogleVisionAnnotateResponse;
    const annotation = data.responses?.[0];

    if (!annotation) {
      throw new Error('AI vision service temporarily unavailable');
    }

    if (annotation.error?.message) {
      console.error('Google Cloud Vision returned an OCR error:', annotation.error.message);
      throw new Error('AI vision service temporarily unavailable');
    }

    const ocrResult = extractLinesFromGoogleVision(annotation, imageSize);

    if (ocrResult.lines.length === 0 || !ocrResult.text.trim()) {
      throw new Error('Could not extract sufficient Chinese text from image');
    }

    const validation = validateOcrLines(ocrResult.lines);
    if (!validation.valid) {
      throw new Error(validation.error || 'Could not extract sufficient Chinese text from image');
    }

    return ocrResult;
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
 * 1. OCR: Extract text lines + layout from image
 * 2. Parse: Segment and analyze text (text model, streaming)
 *
 * @param imageDataUrl - Base64 data URL (e.g., "data:image/jpeg;base64,...")
 * @returns Object with streaming response and extracted text (for pinyin correction)
 */
export async function streamParseImage(imageDataUrl: string): Promise<{
  response: Response;
  extractedText: string;
}> {
  // Stage 1: OCR - extract canonical text + layout from image
  const ocrResult = await extractLinesFromImage(imageDataUrl);
  const extractedText = ocrResult.text;
  const truncatedText = extractedText.slice(0, config.ocr.maxTextLength);

  // Stage 2: Parse - use text model for linguistic analysis
  const response = await streamParse(truncatedText);

  return { response, extractedText: truncatedText };
}

/**
 * OCR-only endpoint helper for image layout
 */
export async function ocrImage(imageDataUrl: string): Promise<OcrResult> {
  return extractLinesFromImage(imageDataUrl);
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
  result: ValidatedParseResponse;
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
    console.error('parseNonStreaming: OPENROUTER_API_KEY not set');
    throw new Error('AI service not configured');
  }

  if (!model) {
    console.error('parseNonStreaming: No model specified and OPENROUTER_MODEL not set');
    throw new Error('AI service not configured');
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
        temperature: TEMPERATURE,
        provider: providerOverride
          ? { only: [providerOverride] }
          : { sort: 'throughput' },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`OpenRouter API error (${response.status}):`, errorBody);
      throw new Error('AI service request failed');
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from model');
    }

    // Parse and validate the JSON response
    let rawResult: unknown;
    try {
      rawResult = JSON.parse(content);
    } catch {
      console.error('parseNonStreaming: Failed to parse JSON from model:', content.slice(0, 200));
      throw new Error('Invalid AI response format');
    }

    let result: ValidatedParseResponse;
    try {
      result = ParseResponseSchema.parse(rawResult);
    } catch (validationError) {
      if (validationError instanceof ZodError) {
        console.error('parseNonStreaming: AI response validation failed:', validationError.issues);
      }
      throw new Error('Invalid AI response format');
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
