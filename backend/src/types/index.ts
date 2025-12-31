/**
 * A single dictionary entry from CC-CEDICT
 */
export interface DictionaryEntry {
  id: number;
  simplified: string;
  traditional: string;
  pinyin: string;
  definitions: string[];
}

/**
 * Raw database row (definitions stored as JSON string)
 */
export interface DictionaryRow {
  id: number;
  simplified: string;
  traditional: string;
  pinyin: string;
  definitions: string;
}

/**
 * Request body for POST /definitionLookup
 */
export interface LookupRequest {
  token: string;
}

/**
 * Response for POST /definitionLookup
 */
export interface LookupResponse {
  entries: DictionaryEntry[];
  /** Only present if recursive segmentation was needed */
  segments?: string[];
}

/**
 * Segment returned from AI parsing
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
 * Full response from AI parsing
 */
export interface ParseResponse {
  translation: string;
  translationParts: TranslationPart[];
  segments: ParsedSegment[];
}

/**
 * Request body for POST /parse (used in Phase 3)
 */
export interface ParseRequest {
  sentence: string;
}
