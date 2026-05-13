/**
 * Text-fitting utilities for rendering translations inside OCR bounding boxes.
 *
 * Uses Canvas text measurement to wrap, split, and fit translation text
 * into a set of bounding boxes at progressively smaller font sizes.
 */

import type { OcrBox } from '@/types';

const MIN_TRANSLATION_FONT_SIZE = 9;

let measurementCanvas: HTMLCanvasElement | null = null;

function getMeasurementContext(fontSize: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!measurementCanvas) {
    measurementCanvas = document.createElement('canvas');
  }
  const ctx = measurementCanvas.getContext('2d');
  if (!ctx) return null;
  const fontFamily = getComputedStyle(document.body).fontFamily || 'sans-serif';
  ctx.font = `${fontSize}px ${fontFamily}`;
  return ctx;
}

function fitWordToWidth(
  word: string,
  maxWidth: number,
  ctx: CanvasRenderingContext2D,
): { fit: string; rest: string } {
  if (!word) return { fit: '', rest: '' };
  if (ctx.measureText(word).width <= maxWidth) {
    return { fit: word, rest: '' };
  }

  let low = 1;
  let high = word.length;
  let best = '';

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const slice = word.slice(0, mid);
    if (ctx.measureText(slice).width <= maxWidth) {
      best = slice;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (!best) {
    return { fit: word.slice(0, 1), rest: word.slice(1) };
  }

  return { fit: best, rest: word.slice(best.length) };
}

function wrapTextToLines(
  text: string,
  maxWidth: number,
  maxLines: number,
  ctx: CanvasRenderingContext2D,
): { lines: string[]; remainingText: string } {
  if (!text.trim()) return { lines: [], remainingText: '' };
  if (maxWidth <= 0 || maxLines <= 0) {
    return { lines: [], remainingText: text.trim() };
  }

  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let line = '';
  let index = 0;

  while (index < words.length) {
    const word = words[index];
    const candidate = line ? `${line} ${word}` : word;

    if (ctx.measureText(candidate).width <= maxWidth) {
      line = candidate;
      index += 1;
      continue;
    }

    if (!line) {
      const { fit, rest } = fitWordToWidth(word, maxWidth, ctx);
      line = fit;
      if (rest) {
        words[index] = rest;
      } else {
        index += 1;
      }
    }

    lines.push(line);
    line = '';

    if (lines.length >= maxLines) {
      break;
    }
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  const remainingWords = words.slice(index);
  const remainingText = remainingWords.length ? remainingWords.join(' ') : '';

  return { lines, remainingText };
}

function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const candidate = text.slice(0, maxChars);
  const lastSpace = candidate.lastIndexOf(' ');
  if (lastSpace > Math.max(6, maxChars - 12)) {
    return candidate.slice(0, lastSpace);
  }
  return candidate;
}

function getBoxCapacity(
  box: OcrBox,
  imageSize: { width: number; height: number },
  fontSize: number,
  lineHeight: number,
  paddingX: number,
  paddingY: number,
): number {
  const widthPx = box.w * imageSize.width - paddingX * 2;
  const heightPx = box.h * imageSize.height - paddingY * 2;
  if (widthPx <= 0 || heightPx <= 0) return 0;

  const avgCharWidth = fontSize * 0.55;
  const charsPerLine = Math.max(6, Math.floor(widthPx / avgCharWidth));
  const maxLines = Math.max(1, Math.floor(heightPx / lineHeight));
  return Math.max(12, charsPerLine * maxLines);
}

function splitTranslationIntoBoxes(
  translation: string,
  boxes: OcrBox[],
  imageSize: { width: number; height: number },
  fontSize: number,
  lineHeight: number,
  paddingX: number,
  paddingY: number,
  allowEllipsis: boolean,
): { chunks: string[]; remaining: string } {
  let remaining = translation.trim();
  const chunks: string[] = [];
  const ctx = getMeasurementContext(fontSize);

  boxes.forEach((box, index) => {
    if (!remaining) {
      chunks.push('');
      return;
    }

    const widthPx = box.w * imageSize.width - paddingX * 2;
    const heightPx = box.h * imageSize.height - paddingY * 2;
    const maxLines = Math.max(1, Math.floor(heightPx / lineHeight));

    if (ctx && widthPx > 0 && heightPx > 0) {
      const { lines, remainingText } = wrapTextToLines(remaining, widthPx, maxLines, ctx);
      const chunk = lines.join('\n');
      remaining = remainingText.trimStart();

      if (allowEllipsis && index === boxes.length - 1 && remaining.length > 0) {
        chunks.push(chunk ? `${chunk}...` : '...');
        remaining = '';
        return;
      }

      chunks.push(chunk);
      return;
    }

    const capacity = getBoxCapacity(box, imageSize, fontSize, lineHeight, paddingX, paddingY);
    if (capacity <= 0) {
      chunks.push('');
      return;
    }

    const chunk =
      remaining.length > capacity ? truncateAtWordBoundary(remaining, capacity) : remaining;

    remaining = remaining.slice(chunk.length).trimStart();

    if (allowEllipsis && index === boxes.length - 1 && remaining.length > 0) {
      chunks.push(`${chunk}...`);
      remaining = '';
      return;
    }

    chunks.push(chunk);
  });

  if (chunks.length < boxes.length) {
    for (let i = chunks.length; i < boxes.length; i += 1) {
      chunks.push('');
    }
  }

  return { chunks, remaining };
}

/**
 * Fit a translation string into a set of bounding boxes, trying progressively
 * smaller font sizes.  Falls back to ellipsis on the last box if the text
 * still doesn't fit at the smallest size.
 */
export function fitTranslationToBoxes(
  translation: string,
  orderedBoxes: OcrBox[],
  imageSize: { width: number; height: number },
  baseFontSize: number,
  paddingX: number,
  paddingY: number,
): { chunks: string[]; fontSize: number; lineHeight: number } {
  const fontSizes = [baseFontSize, baseFontSize - 1, baseFontSize - 2].filter(
    (size, index, self) => size >= MIN_TRANSLATION_FONT_SIZE && self.indexOf(size) === index,
  );

  if (imageSize.width <= 0 || imageSize.height <= 0) {
    return {
      chunks: orderedBoxes.map((_, idx) => (idx === 0 ? translation : '')),
      fontSize: baseFontSize,
      lineHeight: Math.round(baseFontSize * 1.35),
    };
  }

  for (let i = 0; i < fontSizes.length; i += 1) {
    const fontSize = fontSizes[i];
    const lineHeight = Math.round(fontSize * 1.35);
    const { chunks, remaining } = splitTranslationIntoBoxes(
      translation,
      orderedBoxes,
      imageSize,
      fontSize,
      lineHeight,
      paddingX,
      paddingY,
      false,
    );

    if (!remaining) {
      return { chunks, fontSize, lineHeight };
    }
  }

  const fallbackFontSize = fontSizes[fontSizes.length - 1] || MIN_TRANSLATION_FONT_SIZE;
  const fallbackLineHeight = Math.round(fallbackFontSize * 1.35);
  const { chunks } = splitTranslationIntoBoxes(
    translation,
    orderedBoxes,
    imageSize,
    fallbackFontSize,
    fallbackLineHeight,
    paddingX,
    paddingY,
    true,
  );

  return { chunks, fontSize: fallbackFontSize, lineHeight: fallbackLineHeight };
}

/**
 * Sort bounding boxes into reading order (top-to-bottom, left-to-right).
 */
export function sortBoxesForReading(boxes: OcrBox[]): OcrBox[] {
  return [...boxes].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 0.005) return yDiff;
    return a.x - b.x;
  });
}
