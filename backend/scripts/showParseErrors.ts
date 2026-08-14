/**
 * Pretty-print recent entries from the parse-error log.
 *
 *   npm run errors            # last 10 entries, summarized
 *   npm run errors -- 50      # last 50
 *   npm run errors -- --full  # include full stored payloads
 */

import { readFile } from 'node:fs/promises';
import { PARSE_ERROR_LOG_PATH } from '../src/services/parseErrorLog.js';

interface LogEntry {
  timestamp: string;
  model: string;
  route: string;
  stage: string;
  message: string;
  sentence?: string;
  raw?: string;
  emitted?: string;
}

/** Show the payload around the position a JSON.parse error points at */
function errorContext(message: string, payload: string | undefined): string | null {
  if (!payload) return null;
  const match = /position (\d+)/.exec(message);
  if (!match) return null;
  const pos = Number(match[1]);
  const start = Math.max(0, pos - 80);
  const end = Math.min(payload.length, pos + 80);
  const marker = ' '.repeat(Math.min(pos, 80)) + '▲';
  return `${payload.slice(start, end)}\n      ${marker}`;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const full = args.includes('--full');
  const count = Number(args.find((a) => /^\d+$/.test(a))) || 10;

  let content: string;
  try {
    content = await readFile(PARSE_ERROR_LOG_PATH, 'utf8');
  } catch {
    console.log(`No parse errors logged yet (${PARSE_ERROR_LOG_PATH} not found).`);
    return;
  }

  const entries = content
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as LogEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is LogEntry => e !== null);

  const shown = entries.slice(-count);
  console.log(`${entries.length} total entries — showing last ${shown.length}\n`);

  for (const entry of shown) {
    console.log(`── ${entry.timestamp}  ${entry.route} / ${entry.stage}  [${entry.model}]`);
    console.log(`   ${entry.message}`);
    if (entry.sentence) console.log(`   sentence: ${entry.sentence}`);

    const payload = entry.stage === 'pinyin-injection' ? entry.emitted : entry.raw;
    const context = errorContext(entry.message, payload);
    if (context) {
      console.log(`   context:\n      ${context.split('\n').join('\n      ')}`);
    }
    if (full) {
      if (entry.raw) console.log(`   raw:\n${entry.raw}`);
      if (entry.emitted) console.log(`   emitted:\n${entry.emitted}`);
    }
    console.log();
  }
}

void main();
