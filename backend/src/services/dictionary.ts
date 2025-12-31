import Database from 'better-sqlite3';
import { LRUCache } from 'lru-cache';
import { resolve } from 'path';
import { config } from '../config/index.js';
import type { DictionaryEntry, DictionaryRow, LookupResponse } from '../types/index.js';

const DB_PATH = resolve(process.cwd(), 'data/cedict.sqlite');

// Singleton database instance
let db: Database.Database | null = null;

/**
 * Get the singleton database connection
 */
export function getDatabase(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
  }
  return db;
}

/**
 * Close the database connection (for cleanup/testing)
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// LRU cache for dictionary lookups
const lookupCache = new LRUCache<string, DictionaryEntry[]>({
  max: config.cache.maxSize,
});

// Separate cache for recursive segmentation results
const segmentCache = new LRUCache<string, string[]>({
  max: config.cache.maxSize,
});

/**
 * Convert a database row to a DictionaryEntry
 */
function rowToEntry(row: DictionaryRow): DictionaryEntry {
  return {
    id: row.id,
    simplified: row.simplified,
    traditional: row.traditional,
    pinyin: row.pinyin,
    definitions: JSON.parse(row.definitions),
  };
}

/**
 * Look up a token in the dictionary.
 * Returns all matching entries (by simplified OR traditional).
 * Results are cached in an LRU cache.
 */
export function lookup(token: string): DictionaryEntry[] {
  // Check cache first
  const cached = lookupCache.get(token);
  if (cached !== undefined) {
    return cached;
  }

  const database = getDatabase();
  
  // Query for both simplified and traditional matches
  // Use UNION to avoid duplicates when simplified === traditional
  const stmt = database.prepare(`
    SELECT * FROM entries WHERE simplified = ?
    UNION
    SELECT * FROM entries WHERE traditional = ?
  `);
  
  const rows = stmt.all(token, token) as DictionaryRow[];
  const entries = rows.map(rowToEntry);
  
  // Cache the result (even if empty)
  lookupCache.set(token, entries);
  
  return entries;
}

/**
 * Recursively segment a token into dictionary-matchable parts.
 * Uses greedy longest-match-first strategy.
 * 
 * Example: "你好吗" -> ["你好", "吗"] (if 你好吗 not in dictionary)
 */
export function recursiveSegment(token: string): string[] {
  // Check cache first
  const cached = segmentCache.get(token);
  if (cached !== undefined) {
    return cached;
  }

  const result = recursiveSegmentImpl(token);
  segmentCache.set(token, result);
  return result;
}

/**
 * Internal implementation of recursive segmentation
 */
function recursiveSegmentImpl(segment: string): string[] {
  // Base case: empty string
  if (segment.length === 0) {
    return [];
  }

  // Check if the whole segment exists in dictionary
  const wholeEntry = lookup(segment);
  if (wholeEntry.length > 0) {
    return [segment];
  }

  // Try to find the longest prefix that exists in dictionary
  // Start from length-1 and work down
  for (let splitSize = segment.length - 1; splitSize >= 1; splitSize--) {
    const left = segment.slice(0, splitSize);
    const right = segment.slice(splitSize);

    const leftEntry = lookup(left);
    if (leftEntry.length > 0) {
      // Found a match for the left part, recursively process the right
      const rightSegments = recursiveSegment(right);
      return [left, ...rightSegments];
    }
  }

  // No dictionary match found for any prefix
  // Fall back to taking the first character and continuing
  const firstChar = segment[0];
  const remaining = segment.slice(1);
  return [firstChar, ...recursiveSegment(remaining)];
}

/**
 * Main lookup function for the API endpoint.
 * Tries direct lookup first, falls back to recursive segmentation.
 * 
 * @returns LookupResponse with entries, and segments if recursive breakdown was needed
 * @returns null if token not found and couldn't be segmented to anything useful
 */
export function definitionLookup(token: string): LookupResponse | null {
  // Validate input
  if (!token || token.trim() === '') {
    return null;
  }

  const trimmedToken = token.trim();

  // Try direct lookup first
  const directEntries = lookup(trimmedToken);
  
  if (directEntries.length > 0) {
    // Found direct match(es)
    return { entries: directEntries };
  }

  // No direct match - try recursive segmentation
  const segments = recursiveSegment(trimmedToken);
  
  // Collect entries for all segments
  const allEntries: DictionaryEntry[] = [];
  for (const seg of segments) {
    const segEntries = lookup(seg);
    allEntries.push(...segEntries);
  }

  // If we still have no entries (e.g., all single chars not in dictionary),
  // return null to indicate 404
  if (allEntries.length === 0) {
    return null;
  }

  return {
    entries: allEntries,
    segments,
  };
}

/**
 * Clear all caches (useful for testing)
 */
export function clearCaches(): void {
  lookupCache.clear();
  segmentCache.clear();
}
