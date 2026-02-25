import type { SentenceChunk } from '@/types';

const HARD_BREAKS = new Set(['。', '！', '？', '；', '!', '?', ';', '…']);
const PUNCTUATION_ONLY_REGEX = /^[\s\p{P}\p{S}]+$/u;
const PUNCTUATION_CHAR_REGEX = /[\p{P}\p{S}]/u;

function isPunctuationOnly(text: string): boolean {
  const trimmed = text.trim();
  return !!trimmed && PUNCTUATION_ONLY_REGEX.test(trimmed);
}

function isPunctuationChar(char: string): boolean {
  return PUNCTUATION_CHAR_REGEX.test(char);
}

function isListMarkerAt(text: string, index: number): number | null {
  if (index < 0 || index >= text.length) return null;
  if (!/\d/.test(text[index])) return null;

  let j = index;
  while (j < text.length && /\d/.test(text[j])) {
    j += 1;
  }

  if (text[j] === '、') {
    return j + 1;
  }

  return null;
}

export function splitCombinedTextIntoSentences(combinedText: string): SentenceChunk[] {
  if (!combinedText) return [];

  const chunks: SentenceChunk[] = [];
  let start = 0;
  let chunkIndex = 0;
  let pendingPrefix = '';
  let pendingStart = 0;
  let pendingEnd = 0;

  const addChunk = (chunkStart: number, chunkEnd: number) => {
    if (chunkEnd <= chunkStart) return;
    const raw = combinedText.slice(chunkStart, chunkEnd);
    const trimmed = raw.trim();
    if (!trimmed) return;

    const trimStartOffset = raw.indexOf(trimmed);
    let actualStart = chunkStart + (trimStartOffset >= 0 ? trimStartOffset : 0);
    let actualEnd = actualStart + trimmed.length;
    let normalizedText = trimmed.replace(/\s+/g, ' ');

    if (isPunctuationOnly(normalizedText)) {
      if (chunks.length > 0) {
        const prev = chunks[chunks.length - 1];
        prev.text = `${prev.text}${normalizedText}`;
        prev.endOffset = Math.max(prev.endOffset, actualEnd);
      } else {
        if (!pendingPrefix) {
          pendingStart = actualStart;
          pendingEnd = actualEnd;
        } else {
          pendingEnd = actualEnd;
        }
        pendingPrefix = `${pendingPrefix}${normalizedText}`;
      }
      return;
    }

    if (pendingPrefix) {
      normalizedText = `${pendingPrefix}${normalizedText}`;
      actualStart = pendingStart;
      pendingPrefix = '';
      pendingEnd = 0;
    }

    chunks.push({
      id: `sentence-${chunkIndex + 1}`,
      text: normalizedText,
      startOffset: actualStart,
      endOffset: actualEnd,
    });
    chunkIndex += 1;
  };

  for (let i = 0; i < combinedText.length; i += 1) {
    const listMarkerEnd = i > start ? isListMarkerAt(combinedText, i) : null;
    if (listMarkerEnd !== null) {
      addChunk(start, i);
      start = i;
      continue;
    }

    const char = combinedText[i];
    if (HARD_BREAKS.has(char)) {
      let end = i + 1;
      while (end < combinedText.length && isPunctuationChar(combinedText[end])) {
        end += 1;
      }
      addChunk(start, end);
      start = end;
      i = end - 1;
    }
  }

  if (start < combinedText.length) {
    addChunk(start, combinedText.length);
  }

  if (pendingPrefix && chunks.length > 0) {
    const last = chunks[chunks.length - 1];
    last.text = `${last.text}${pendingPrefix}`;
    last.endOffset = Math.max(last.endOffset, pendingEnd);
  }

  return chunks;
}
