/**
 * OCR layout utilities — mapping sentence offsets to OCR bounding boxes.
 */

import type { OcrBox, OcrLine, SentenceChunk } from '@/types';

export interface LineRange {
  line: OcrLine;
  startOffset: number;
  endOffset: number;
}

/**
 * Build a list of character-offset ranges for a list of OCR lines.
 * Lines are separated by a single newline character (offset +1).
 */
export function buildLineRanges(lines: OcrLine[]): LineRange[] {
  let cursor = 0;
  return lines.map((line) => {
    const startOffset = cursor;
    const endOffset = startOffset + line.text.length;
    cursor = endOffset + 1;
    return { line, startOffset, endOffset };
  });
}

/**
 * Given a sentence chunk and the OCR line ranges, compute the set of
 * bounding boxes that cover the sentence text (possibly spanning multiple lines).
 */
export function computeSentenceBoxes(
  sentence: SentenceChunk,
  lineRanges: LineRange[],
): OcrBox[] {
  const boxes: OcrBox[] = [];

  lineRanges.forEach(({ line, startOffset, endOffset }) => {
    const overlapStart = Math.max(sentence.startOffset, startOffset);
    const overlapEnd = Math.min(sentence.endOffset, endOffset);

    if (overlapEnd <= overlapStart) return;

    const lineLength = endOffset - startOffset;
    if (lineLength <= 0) return;

    const relativeStart = overlapStart - startOffset;
    const relativeEnd = overlapEnd - startOffset;
    const x = line.box.x + (relativeStart / lineLength) * line.box.w;
    const w = ((relativeEnd - relativeStart) / lineLength) * line.box.w;

    if (!Number.isFinite(x) || !Number.isFinite(w) || w <= 0) {
      boxes.push({ ...line.box });
      return;
    }

    boxes.push({
      x,
      y: line.box.y,
      w,
      h: line.box.h,
    });
  });

  return boxes;
}
