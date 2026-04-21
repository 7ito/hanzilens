/**
 * OCR layout utilities — mapping sentence offsets to OCR bounding boxes.
 */

import type { OcrBox, OcrWord, SentenceChunk } from '@/types';

function mergeBoxes(a: OcrBox | null, b: OcrBox): OcrBox {
  if (!a) return { ...b };

  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);

  return {
    x: x1,
    y: y1,
    w: x2 - x1,
    h: y2 - y1,
  };
}

/**
 * Given a sentence chunk and OCR words with canonical text offsets, compute the set of
 * bounding boxes that cover the sentence text. Words are merged per line to keep the
 * overlay visually clean while preserving OCR-native geometry.
 */
export function computeSentenceBoxes(
  sentence: SentenceChunk,
  words: OcrWord[],
): OcrBox[] {
  const mergedBoxesByLineId = new Map<string, OcrBox>();
  const lineOrder: string[] = [];

  words.forEach((word) => {
    const overlapStart = Math.max(sentence.startOffset, word.startOffset);
    const overlapEnd = Math.min(sentence.endOffset, word.endOffset);

    if (overlapEnd <= overlapStart) return;

    if (!mergedBoxesByLineId.has(word.lineId)) {
      lineOrder.push(word.lineId);
    }

    const existing = mergedBoxesByLineId.get(word.lineId) ?? null;
    mergedBoxesByLineId.set(word.lineId, mergeBoxes(existing, word.box));
  });

  return lineOrder
    .map((lineId) => mergedBoxesByLineId.get(lineId))
    .filter((box): box is OcrBox => !!box);
}
