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
 * Segment returned from AI parsing (used in Phase 3)
 */
export interface ParsedSegment {
  token: string;
  pinyin: string;
  definition: string;
}

/**
 * Request body for POST /parse (used in Phase 3)
 */
export interface ParseRequest {
  sentence: string;
}
