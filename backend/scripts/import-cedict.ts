import Database from 'better-sqlite3';
import { readFileSync, existsSync, renameSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Regex to parse CC-CEDICT line format:
// Traditional Simplified [pinyin] /def1/def2/.../
const LINE_REGEX = /^(.+?) (.+?) \[(.+?)\] \/(.+)\/$/;

export interface ParsedEntry {
  traditional: string;
  simplified: string;
  pinyin: string;
  definitions: string[];
}

/**
 * Parse a single CC-CEDICT line into a structured entry.
 * Returns null for comments, empty lines, or unparseable lines.
 */
export function parseLine(line: string): ParsedEntry | null {
  // Normalize line endings (handle Windows CRLF)
  const normalizedLine = line.replace(/\r$/, '');
  
  // Skip empty lines
  if (!normalizedLine || normalizedLine.trim() === '') {
    return null;
  }

  // Skip comment lines
  if (normalizedLine.startsWith('#')) {
    return null;
  }

  const match = normalizedLine.match(LINE_REGEX);
  if (!match) {
    return null;
  }

  const [, traditional, simplified, pinyin, rawDefs] = match;
  
  // Split definitions by '/' and filter empty strings
  const definitions = rawDefs.split('/').filter(Boolean);

  return {
    traditional,
    simplified,
    pinyin,
    definitions,
  };
}

/**
 * Main import function - reads CC-CEDICT and creates SQLite database
 */
export async function main(): Promise<void> {
  const startTime = Date.now();

  // Resolve paths
  const cedictPath = resolve(__dirname, '../../cedict_ts.u8');
  const dataDir = resolve(__dirname, '../data');
  const dbPath = resolve(dataDir, 'cedict.sqlite');
  const backupPath = resolve(dataDir, 'cedict.sqlite.backup');

  // Verify source file exists
  if (!existsSync(cedictPath)) {
    console.error(`Error: CC-CEDICT file not found at ${cedictPath}`);
    console.error('Please download cedict_ts.u8 from https://www.mdbg.net/chinese/dictionary?page=cc-cedict');
    process.exit(1);
  }

  // Create data directory if it doesn't exist
  if (!existsSync(dataDir)) {
    console.log(`Creating data directory: ${dataDir}`);
    mkdirSync(dataDir, { recursive: true });
  }

  // Backup existing database if it exists
  if (existsSync(dbPath)) {
    console.log(`Backing up existing database to ${backupPath}`);
    renameSync(dbPath, backupPath);
  }

  console.log(`Reading CC-CEDICT from ${cedictPath}...`);
  const content = readFileSync(cedictPath, 'utf-8');
  const lines = content.split('\n');
  console.log(`Read ${lines.length} lines`);

  // Create database
  console.log(`Creating database at ${dbPath}...`);
  const db = new Database(dbPath);

  // Create schema
  db.exec(`
    CREATE TABLE entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      simplified TEXT NOT NULL,
      traditional TEXT NOT NULL,
      pinyin TEXT NOT NULL,
      definitions TEXT NOT NULL
    );
  `);

  // Prepare insert statement
  const insert = db.prepare(`
    INSERT INTO entries (simplified, traditional, pinyin, definitions)
    VALUES (?, ?, ?, ?)
  `);

  // Parse all lines
  const entries: ParsedEntry[] = [];
  let skippedLines = 0;
  let commentLines = 0;
  let emptyLines = 0;

  for (const line of lines) {
    if (line.trim() === '') {
      emptyLines++;
      continue;
    }

    if (line.startsWith('#')) {
      commentLines++;
      continue;
    }

    const parsed = parseLine(line);
    if (parsed) {
      entries.push(parsed);
    } else {
      skippedLines++;
      console.warn(`Warning: Could not parse line: ${line.substring(0, 80)}...`);
    }
  }

  console.log(`Parsed ${entries.length} entries (skipped ${skippedLines} unparseable, ${commentLines} comments, ${emptyLines} empty)`);

  // Insert all entries in a single transaction for performance
  console.log('Inserting entries into database...');
  const insertMany = db.transaction((entries: ParsedEntry[]) => {
    for (const entry of entries) {
      insert.run(
        entry.simplified,
        entry.traditional,
        entry.pinyin,
        JSON.stringify(entry.definitions)
      );
    }
  });

  insertMany(entries);

  // Create indexes
  console.log('Creating indexes...');
  db.exec(`
    CREATE INDEX idx_simplified ON entries(simplified);
    CREATE INDEX idx_traditional ON entries(traditional);
    CREATE INDEX idx_pinyin ON entries(pinyin);
  `);

  // Verify
  const count = db.prepare('SELECT COUNT(*) as count FROM entries').get() as { count: number };
  console.log(`Database contains ${count.count} entries`);

  // Close database
  db.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\nImport completed in ${elapsed}s`);
  console.log(`Database created at: ${dbPath}`);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
  });
}
