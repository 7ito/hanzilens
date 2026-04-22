import type { OcrLine, OcrResult, SentenceChunk } from '@/types';

const HARD_BREAKS = new Set(['。', '！', '？', '；', '!', '?', ';', '…']);
const PUNCTUATION_ONLY_REGEX = /^[\s\p{P}\p{S}]+$/u;
const PUNCTUATION_CHAR_REGEX = /[\p{P}\p{S}]/u;
const OCR_STANDALONE_LINE_MAX_LENGTH = 8;
const OCR_STANDALONE_WIDTH_RATIO = 0.72;
const OCR_GAP_SPLIT_RATIO = 1.35;

function isPunctuationOnly(text: string): boolean {
  const trimmed = text.trim();
  return !!trimmed && PUNCTUATION_ONLY_REGEX.test(trimmed);
}

function isPunctuationChar(char: string): boolean {
  return PUNCTUATION_CHAR_REGEX.test(char);
}

function normalizedLength(text: string): number {
  return text.replace(/\s+/g, ' ').trim().length;
}

function median(values: number[]): number {
  if (!values.length) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function lastNonWhitespaceChar(text: string): string | null {
  const trimmed = text.trim();
  return trimmed ? trimmed[trimmed.length - 1] : null;
}

function lineGap(prevLine: OcrLine, nextLine: OcrLine): number {
  return nextLine.box.y - (prevLine.box.y + prevLine.box.h);
}

function isLikelyStandaloneOcrLine(
  line: OcrLine,
  nextLine: OcrLine | undefined,
  referenceWidth: number,
): boolean {
  if (!nextLine || referenceWidth <= 0) return false;

  const length = normalizedLength(line.text);
  if (length === 0 || length > OCR_STANDALONE_LINE_MAX_LENGTH) return false;

  const trailingChar = lastNonWhitespaceChar(line.text);
  if (trailingChar && HARD_BREAKS.has(trailingChar)) return false;

  return line.box.w <= referenceWidth * OCR_STANDALONE_WIDTH_RATIO;
}

function shouldSplitAfterOcrLine(
  line: OcrLine,
  nextLine: OcrLine | undefined,
  referenceWidth: number,
  medianGap: number,
): boolean {
  const trailingChar = lastNonWhitespaceChar(line.text);
  if (trailingChar && HARD_BREAKS.has(trailingChar)) {
    return true;
  }

  if (isLikelyStandaloneOcrLine(line, nextLine, referenceWidth)) {
    return true;
  }

  if (!nextLine || medianGap <= 0) return false;

  const gap = lineGap(line, nextLine);
  return gap > medianGap * OCR_GAP_SPLIT_RATIO;
}

function splitRangeIntoSentences(
  combinedText: string,
  rangeStart: number,
  rangeEnd: number,
): SentenceChunk[] {
  const raw = combinedText.slice(rangeStart, rangeEnd);
  const chunks = splitCombinedTextIntoSentences(raw);

  return chunks.map((chunk) => ({
    ...chunk,
    startOffset: chunk.startOffset + rangeStart,
    endOffset: chunk.endOffset + rangeStart,
  }));
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

export function splitOcrResultIntoSentences(ocrResult: OcrResult): SentenceChunk[] {
  if (!ocrResult.text) return [];
  if (!ocrResult.lines.length) return splitCombinedTextIntoSentences(ocrResult.text);

  const referenceWidth = Math.max(
    0,
    ...ocrResult.lines
      .map((line) => line.box.w)
      .filter((width) => Number.isFinite(width) && width > 0)
  );

  const medianWidth = median(
    ocrResult.lines
      .map((line) => line.box.w)
      .filter((width) => Number.isFinite(width) && width > 0)
  );

  const medianGap = median(
    ocrResult.lines
      .slice(0, -1)
      .map((line, index) => lineGap(line, ocrResult.lines[index + 1]))
      .filter((gap) => Number.isFinite(gap) && gap > 0)
  );

  const chunks: SentenceChunk[] = [];
  let rangeStart = ocrResult.lines[0].startOffset;

  ocrResult.lines.forEach((line, index) => {
    const nextLine = ocrResult.lines[index + 1];
    const shouldSplit = shouldSplitAfterOcrLine(
      line,
      nextLine,
      Math.max(referenceWidth, medianWidth),
      medianGap,
    );

    if (!shouldSplit) return;

    chunks.push(...splitRangeIntoSentences(ocrResult.text, rangeStart, line.endOffset));
    rangeStart = nextLine ? nextLine.startOffset : line.endOffset;
  });

  const lastLine = ocrResult.lines[ocrResult.lines.length - 1];
  if (rangeStart < lastLine.endOffset) {
    chunks.push(...splitRangeIntoSentences(ocrResult.text, rangeStart, lastLine.endOffset));
  }

  return chunks.map((chunk, index) => ({
    ...chunk,
    id: `sentence-${index + 1}`,
  }));
}
