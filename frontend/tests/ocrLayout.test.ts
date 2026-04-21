import { describe, expect, it } from 'vitest';
import { computeSentenceBoxes } from '@/lib/ocrLayout';
import type { OcrWord, SentenceChunk } from '@/types';

describe('computeSentenceBoxes', () => {
  it('merges overlapping OCR words by line instead of slicing the full line box', () => {
    const words: OcrWord[] = [
      {
        id: 'w1',
        text: '第一句',
        startOffset: 0,
        endOffset: 3,
        lineId: 'l1',
        box: { x: 0.1, y: 0.2, w: 0.18, h: 0.06 },
      },
      {
        id: 'w2',
        text: '。',
        startOffset: 3,
        endOffset: 4,
        lineId: 'l1',
        box: { x: 0.29, y: 0.2, w: 0.03, h: 0.06 },
      },
      {
        id: 'w3',
        text: '第二句',
        startOffset: 5,
        endOffset: 8,
        lineId: 'l2',
        box: { x: 0.12, y: 0.32, w: 0.2, h: 0.06 },
      },
    ];

    const sentence: SentenceChunk = {
      id: 's1',
      text: '第一句。',
      startOffset: 0,
      endOffset: 4,
    };

    const boxes = computeSentenceBoxes(sentence, words);

    expect(boxes).toHaveLength(1);
    expect(boxes[0].x).toBeCloseTo(0.1);
    expect(boxes[0].y).toBeCloseTo(0.2);
    expect(boxes[0].w).toBeCloseTo(0.22);
    expect(boxes[0].h).toBeCloseTo(0.06);
  });

  it('returns one merged box per line in reading order for multi-line sentences', () => {
    const words: OcrWord[] = [
      {
        id: 'w1',
        text: '上半句',
        startOffset: 0,
        endOffset: 3,
        lineId: 'l1',
        box: { x: 0.15, y: 0.18, w: 0.2, h: 0.05 },
      },
      {
        id: 'w2',
        text: '。',
        startOffset: 3,
        endOffset: 4,
        lineId: 'l1',
        box: { x: 0.36, y: 0.18, w: 0.02, h: 0.05 },
      },
      {
        id: 'w3',
        text: '下半句',
        startOffset: 5,
        endOffset: 8,
        lineId: 'l2',
        box: { x: 0.18, y: 0.28, w: 0.21, h: 0.05 },
      },
      {
        id: 'w4',
        text: '。',
        startOffset: 8,
        endOffset: 9,
        lineId: 'l2',
        box: { x: 0.4, y: 0.28, w: 0.02, h: 0.05 },
      },
    ];

    const sentence: SentenceChunk = {
      id: 's1',
      text: '上半句。\n下半句。',
      startOffset: 0,
      endOffset: 9,
    };

    const boxes = computeSentenceBoxes(sentence, words);

    expect(boxes).toHaveLength(2);
    expect(boxes[0].x).toBeCloseTo(0.15);
    expect(boxes[0].y).toBeCloseTo(0.18);
    expect(boxes[0].w).toBeCloseTo(0.23);
    expect(boxes[0].h).toBeCloseTo(0.05);
    expect(boxes[1].x).toBeCloseTo(0.18);
    expect(boxes[1].y).toBeCloseTo(0.28);
    expect(boxes[1].w).toBeCloseTo(0.24);
    expect(boxes[1].h).toBeCloseTo(0.05);
  });
});
