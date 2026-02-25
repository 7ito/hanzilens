import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CircleHelp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SentenceCard } from '@/components/SentenceCard';
import { MobileDictionaryModal } from '@/components/MobileDictionaryModal';
import { useIsDarkTheme } from '@/hooks/useIsDarkTheme';
import { useIsMobile } from '@/hooks/useIsMobile';
import { generateHighlightColors } from '@/lib/colors';
import type {
  OcrBox,
  OcrLine,
  OcrResult,
  ParseResponse,
  ParsedSegment,
  SentenceChunk,
} from '@/types';

const TRANSLATION_PADDING_X = 8;
const TRANSLATION_PADDING_Y = 2;
const MIN_TRANSLATION_FONT_SIZE = 9;
let measurementCanvas: HTMLCanvasElement | null = null;

interface ImageResultsViewProps {
  imageDataUrl: string;
  isLoadingOcr: boolean;
  ocrError: string | null;
  ocrResult: OcrResult | null;
  sentences: SentenceChunk[];
  sentenceResults: Record<string, ParseResponse>;
  sentenceLoading: Record<string, boolean>;
  sentenceError: Record<string, string | null>;
  openSentenceIds: string[];
  onBack: () => void;
  onHelpClick: () => void;
  onSelectSentence: (sentenceId: string) => void;
  onRetryOcr?: () => void;
}

interface LineRange {
  line: OcrLine;
  startOffset: number;
  endOffset: number;
}

function buildLineRanges(lines: OcrLine[]): LineRange[] {
  let cursor = 0;
  return lines.map((line) => {
    const startOffset = cursor;
    const endOffset = startOffset + line.text.length;
    cursor = endOffset + 1;
    return { line, startOffset, endOffset };
  });
}

function setAlpha(color: string, alpha: number): string {
  const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
  if (!match) return color;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}

function computeSentenceBoxes(
  sentence: SentenceChunk,
  lineRanges: LineRange[]
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

function truncateAtWordBoundary(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const candidate = text.slice(0, maxChars);
  const lastSpace = candidate.lastIndexOf(' ');
  if (lastSpace > Math.max(6, maxChars - 12)) {
    return candidate.slice(0, lastSpace);
  }
  return candidate;
}

function sortBoxesForReading(boxes: OcrBox[]): OcrBox[] {
  return [...boxes].sort((a, b) => {
    const yDiff = a.y - b.y;
    if (Math.abs(yDiff) > 0.005) return yDiff;
    return a.x - b.x;
  });
}

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
  ctx: CanvasRenderingContext2D
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
  ctx: CanvasRenderingContext2D
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

function getBoxCapacity(
  box: OcrBox,
  imageSize: { width: number; height: number },
  fontSize: number,
  lineHeight: number,
  paddingX: number,
  paddingY: number
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
  allowEllipsis: boolean
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

    const chunk = remaining.length > capacity
      ? truncateAtWordBoundary(remaining, capacity)
      : remaining;

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

function fitTranslationToBoxes(
  translation: string,
  orderedBoxes: OcrBox[],
  imageSize: { width: number; height: number },
  baseFontSize: number,
  paddingX: number,
  paddingY: number
): { chunks: string[]; fontSize: number; lineHeight: number } {
  const fontSizes = [baseFontSize, baseFontSize - 1, baseFontSize - 2].filter(
    (size, index, self) => size >= MIN_TRANSLATION_FONT_SIZE && self.indexOf(size) === index
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
      false
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
    true
  );

  return { chunks, fontSize: fallbackFontSize, lineHeight: fallbackLineHeight };
}


export function ImageResultsView({
  imageDataUrl,
  isLoadingOcr,
  ocrError,
  ocrResult,
  sentences,
  sentenceResults,
  sentenceLoading,
  sentenceError,
  openSentenceIds,
  onBack,
  onHelpClick,
  onSelectSentence,
  onRetryOcr,
}: ImageResultsViewProps) {
  const isMobile = useIsMobile();
  const [hoveredSentenceId, setHoveredSentenceId] = useState<string | null>(null);
  const [pulseSentenceId, setPulseSentenceId] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<ParsedSegment | null>(null);
  const [showTranslationOverlay, setShowTranslationOverlay] = useState(false);
  const sentenceRefs = useRef(new Map<string, HTMLDivElement>());
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });

  const lines = ocrResult?.lines ?? [];
  const lineRanges = useMemo(() => buildLineRanges(lines), [lines]);
  const isDark = useIsDarkTheme();
  const sentenceColors = useMemo(
    () => generateHighlightColors(sentences.length, isDark),
    [sentences.length, isDark]
  );

  const sentenceColorMap = useMemo(() => {
    const map = new Map<string, string>();
    sentences.forEach((sentence, index) => {
      map.set(sentence.id, sentenceColors[index]);
    });
    return map;
  }, [sentences, sentenceColors]);

  const sentenceOverlays = useMemo(() => {
    const map = new Map<string, OcrBox[]>();
    sentences.forEach((sentence) => {
      map.set(sentence.id, computeSentenceBoxes(sentence, lineRanges));
    });
    return map;
  }, [sentences, lineRanges]);

  const openSentenceSet = useMemo(() => new Set(openSentenceIds), [openSentenceIds]);

  useEffect(() => {
    const image = imageRef.current;
    if (!image) return;

    const updateSize = () => {
      const rect = image.getBoundingClientRect();
      setImageSize({ width: rect.width, height: rect.height });
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(image);

    return () => observer.disconnect();
  }, [imageDataUrl]);

  const handleOverlayClick = (sentenceId: string) => {
    if (!openSentenceSet.has(sentenceId)) {
      onSelectSentence(sentenceId);
    }
    const node = sentenceRefs.current.get(sentenceId);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setPulseSentenceId(sentenceId);
      window.setTimeout(() => setPulseSentenceId(null), 600);
    }
  };

  const handleSegmentClick = (segment: ParsedSegment) => {
    setSelectedSegment(segment);
  };

  return (
    <div className="min-h-screen p-4">
      <div className="fixed top-4 left-4 z-10">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" />
          Back
        </Button>
      </div>

      <div className="fixed top-4 right-4 z-10 flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onHelpClick} title="Help">
          <CircleHelp className="size-5" />
        </Button>
        <ThemeToggle />
      </div>

      <div className="pt-16 pb-10 max-w-5xl mx-auto space-y-6">
        <div className="space-y-3">
          <div className="relative rounded-lg border border-border bg-muted overflow-hidden">
            <img
              ref={imageRef}
              src={imageDataUrl}
              alt="Selected"
              className="w-full h-auto block"
              onLoad={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                setImageSize({ width: rect.width, height: rect.height });
              }}
            />

          <div className="absolute inset-0">
            {!showTranslationOverlay &&
              sentences.map((sentence) => {
                const boxes = sentenceOverlays.get(sentence.id) || [];
                const color = sentenceColorMap.get(sentence.id) || 'rgba(59, 130, 246, 0.2)';
                const isActive = openSentenceSet.has(sentence.id) || sentence.id === hoveredSentenceId;
                const backgroundColor = setAlpha(color, isActive ? 0.35 : 0.2);
                const borderColor = setAlpha(color, isActive ? 0.7 : 0.45);

                return boxes.map((box, idx) => (
                  <button
                    key={`${sentence.id}-${idx}`}
                    type="button"
                    onClick={() => handleOverlayClick(sentence.id)}
                    onMouseEnter={() => setHoveredSentenceId(sentence.id)}
                    onMouseLeave={() => setHoveredSentenceId(null)}
                    className="absolute rounded-md border transition-colors"
                    style={{
                      left: `${box.x * 100}%`,
                      top: `${box.y * 100}%`,
                      width: `${box.w * 100}%`,
                      height: `${box.h * 100}%`,
                      backgroundColor,
                      borderColor,
                    }}
                    aria-label="Sentence highlight"
                  />
                ));
              })}

            {showTranslationOverlay &&
              sentences.map((sentence) => {
                const boxes = sentenceOverlays.get(sentence.id) || [];
                if (!boxes.length) return null;

                const color = sentenceColorMap.get(sentence.id) || 'rgba(59, 130, 246, 0.2)';
                const isActive = openSentenceSet.has(sentence.id) || sentence.id === hoveredSentenceId;
                const borderColor = setAlpha(color, isActive ? 0.75 : 0.5);
                const translation = sentenceResults[sentence.id]?.translation;
                const normalizedTranslation = typeof translation === 'string' ? translation.trim() : '';
                const sentenceErr = sentenceError[sentence.id] || null;
                const isSentenceLoading = !!sentenceLoading[sentence.id];
                const hasTranslation = normalizedTranslation.length > 0;
                const orderedBoxes = sortBoxesForReading(boxes);
                const baseFontSize = imageSize.width && imageSize.width < 520 ? 10 : 11;
                const fallbackText = sentenceErr
                  ? 'Failed to load'
                  : isSentenceLoading
                    ? 'Translating...'
                    : 'Tap to load';
                const { chunks, fontSize, lineHeight } = hasTranslation
                  ? fitTranslationToBoxes(
                      normalizedTranslation,
                      orderedBoxes,
                      imageSize,
                      baseFontSize,
                      TRANSLATION_PADDING_X,
                      TRANSLATION_PADDING_Y
                    )
                  : {
                      chunks: orderedBoxes.map((_, idx) => (idx === 0 ? fallbackText : '')),
                      fontSize: baseFontSize,
                      lineHeight: Math.round(baseFontSize * 1.35),
                    };

                return orderedBoxes.map((box, idx) => {
                  const text = chunks[idx] || '';

                  return (
                    <button
                      key={`${sentence.id}-translation-${idx}`}
                      type="button"
                      onClick={() => handleOverlayClick(sentence.id)}
                      onMouseEnter={() => setHoveredSentenceId(sentence.id)}
                      onMouseLeave={() => setHoveredSentenceId(null)}
                      className={`absolute rounded-md border px-2 py-0.5 text-left leading-snug backdrop-blur overflow-hidden whitespace-pre-wrap break-words ${
                        sentenceErr
                          ? 'bg-destructive/15 text-destructive border-destructive/50'
                          : isSentenceLoading
                            ? 'bg-background/80 text-foreground'
                            : hasTranslation
                              ? 'bg-background/75 text-foreground'
                              : 'bg-background/65 text-muted-foreground'
                      }`}
                      style={{
                        left: `${box.x * 100}%`,
                        top: `${box.y * 100}%`,
                        width: `${box.w * 100}%`,
                        height: `${box.h * 100}%`,
                        borderColor: sentenceErr ? undefined : borderColor,
                        fontSize: `${fontSize}px`,
                        lineHeight: `${lineHeight}px`,
                      }}
                      aria-label="Sentence translation"
                      title={sentenceErr || undefined}
                    >
                      {text}
                    </button>
                  );
                });
              })}
          </div>

            {isLoadingOcr && (
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground text-sm">Reading image...</span>
              </div>
            )}
          </div>

          <div className="flex items-center justify-end">
            <div className="inline-flex rounded-full border border-border bg-background shadow-sm p-1">
              <button
                type="button"
                onClick={() => setShowTranslationOverlay(false)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  !showTranslationOverlay
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Original
              </button>
              <button
                type="button"
                onClick={() => setShowTranslationOverlay(true)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  showTranslationOverlay
                    ? 'bg-foreground text-background'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Translation
              </button>
            </div>
          </div>
        </div>

        {ocrError && (
          <div className="border border-destructive/30 bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2 flex items-center justify-between">
            <span>{ocrError}</span>
            {onRetryOcr && (
              <Button variant="outline" size="sm" onClick={onRetryOcr}>
                Retry
              </Button>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="py-1">
            <div className="text-sm font-semibold text-muted-foreground">Sentences</div>
          </div>

          <div className="space-y-4">
          {sentences.map((sentence, index) => {
            const sentenceId = sentence.id;
            const color = sentenceColorMap.get(sentenceId) || sentenceColors[index] || 'rgba(59, 130, 246, 0.2)';
            const result = sentenceResults[sentenceId];
            const isLoading = !!sentenceLoading[sentenceId];
            const error = sentenceError[sentenceId] || null;
            const isExpanded = openSentenceSet.has(sentenceId);
            const isActive = sentenceId === hoveredSentenceId || isExpanded;

            return (
              <div
                key={sentenceId}
                ref={(node) => {
                  if (node) {
                    sentenceRefs.current.set(sentenceId, node);
                  } else {
                    sentenceRefs.current.delete(sentenceId);
                  }
                }}
                className={pulseSentenceId === sentenceId ? 'animate-pulse' : undefined}
              >
                <SentenceCard
                  sentence={sentence}
                  color={color}
                  isExpanded={isExpanded}
                  isLoading={isLoading}
                  error={error}
                  result={result}
                  isActive={isActive}
                  isMobile={isMobile}
                  onToggle={() => onSelectSentence(sentenceId)}
                  onHover={() => setHoveredSentenceId(sentenceId)}
                  onHoverEnd={() => setHoveredSentenceId(null)}
                  onSegmentClick={handleSegmentClick}
                />
              </div>
            );
          })}
          </div>
        </div>
      </div>

      <MobileDictionaryModal
        segment={selectedSegment}
        onClose={() => setSelectedSegment(null)}
      />
    </div>
  );
}
