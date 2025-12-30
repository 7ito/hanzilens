/**
 * Shared types for HanziLens frontend
 */

/**
 * A parsed segment from the AI
 */
export interface ParsedSegment {
  token: string;
  pinyin: string;
  definition: string;
}

/**
 * Response from the /parse endpoint (after streaming completes)
 */
export interface ParseResponse {
  translation: string;
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
export type ViewState = 'input' | 'results';
