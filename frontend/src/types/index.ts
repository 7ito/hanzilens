/**
 * Shared types for HanziLens frontend
 */

/**
 * Input for the parse endpoint - either text or image
 */
export type ParseInput = 
  | { type: 'text'; sentence: string; context?: string }
  | { type: 'image'; image: string }; // base64 data URL

export interface OcrBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OcrLine {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  box: OcrBox;
  wordIds: string[];
  confidence?: number;
}

export interface OcrWord {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
  lineId: string;
  box: OcrBox;
  confidence?: number;
}

export interface OcrResult {
  imageSize?: { width: number; height: number };
  text: string;
  readingDirection: 'horizontal' | 'vertical-rtl';
  lines: OcrLine[];
  words: OcrWord[];
}

export interface SentenceChunk {
  id: string;
  text: string;
  startOffset: number;
  endOffset: number;
}

/**
 * A parsed segment from the AI
 */
export interface ParsedSegment {
  id: number;
  token: string;
  pinyin: string;
  definition: string;
}

/**
 * A part of the English translation with references to segment IDs
 */
export interface TranslationPart {
  text: string;
  segmentIds: number[];
}

/**
 * Response from the /parse endpoint (after streaming completes)
 */
export interface ParseResponse {
  translation: string;
  translationParts: TranslationPart[];
  segments: ParsedSegment[];
}

/**
 * A dictionary entry from CC-CEDICT
 */
export interface DictionaryEntry {
  id: number;
  simplified: string;
  traditional: string;
  pinyin: string;
  definitions: string[];
}

/**
 * Response from the /definitionLookup endpoint
 */
export interface LookupResponse {
  entries: DictionaryEntry[];
  segments?: string[]; // Only present if recursive segmentation was needed
}

/**
 * Application view state
 */
export type ViewState = 'input' | 'results' | 'image-results' | 'paragraph-results';
