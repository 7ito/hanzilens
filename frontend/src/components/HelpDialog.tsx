import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segment } from './Segment';
import { TranslationSpan } from './TranslationSpan';
import { generateHighlightColors } from '@/lib/colors';
import type { ParsedSegment, TranslationPart } from '@/types';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

// Example parsed sentence: 你有光明的未来。
const exampleSegments: ParsedSegment[] = [
  { id: 0, token: '你', pinyin: 'ni3', definition: 'you' },
  { id: 1, token: '有', pinyin: 'you3', definition: 'have' },
  { id: 2, token: '光明', pinyin: 'guang1 ming2', definition: 'bright' },
  { id: 3, token: '的', pinyin: 'de', definition: "'s (possessive)" },
  { id: 4, token: '未来', pinyin: 'wei4 lai2', definition: 'future' },
  { id: 5, token: '。', pinyin: '', definition: '' },
];

// Translation parts with segment alignment
// 你有光明的未来。 -> "You have a bright future."
const exampleTranslationParts: TranslationPart[] = [
  { text: 'You', segmentIds: [0] },
  { text: ' ', segmentIds: [] },
  { text: 'have', segmentIds: [1] },
  { text: ' ', segmentIds: [] },
  { text: 'a', segmentIds: [3] },  // 的 maps to "a" (possessive marker -> article)
  { text: ' ', segmentIds: [] },
  { text: 'bright', segmentIds: [2] },
  { text: ' ', segmentIds: [] },
  { text: 'future', segmentIds: [4] },
  { text: '.', segmentIds: [5] },
];

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  // Track which segment is being hovered (by id)
  const [hoveredSegmentId, setHoveredSegmentId] = useState<number | null>(null);
  // Track which translation part is being hovered (by index)
  const [hoveredPartIndex, setHoveredPartIndex] = useState<number | null>(null);

  // Detect dark mode for color generation
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  // Generate highlight colors for all segments
  const highlightColors = useMemo(
    () => generateHighlightColors(exampleSegments.length, isDark),
    [isDark]
  );

  // Build a map from segment id to its color
  const segmentColorMap = useMemo(() => {
    const map = new Map<number, string>();
    exampleSegments.forEach((seg, idx) => {
      map.set(seg.id, highlightColors[idx]);
    });
    return map;
  }, [highlightColors]);

  // Determine which segment IDs should be highlighted
  const highlightedSegmentIds = useMemo(() => {
    if (hoveredSegmentId !== null) {
      return new Set([hoveredSegmentId]);
    }
    if (hoveredPartIndex !== null && exampleTranslationParts[hoveredPartIndex]) {
      return new Set(exampleTranslationParts[hoveredPartIndex].segmentIds);
    }
    return new Set<number>();
  }, [hoveredSegmentId, hoveredPartIndex]);

  // Check if a translation part should be highlighted
  const isPartHighlighted = (part: TranslationPart, idx: number): boolean => {
    if (hoveredSegmentId !== null) {
      return part.segmentIds.includes(hoveredSegmentId);
    }
    return hoveredPartIndex === idx && part.segmentIds.length > 0;
  };

  // Get highlight color for a translation part (use first matching segment's color)
  const getPartHighlightColor = (part: TranslationPart): string | undefined => {
    if (part.segmentIds.length === 0) return undefined;
    return segmentColorMap.get(part.segmentIds[0]);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <Card className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4"
          onClick={onClose}
        >
          <X className="size-5" />
        </Button>

        {/* Content */}
        <div className="space-y-6">
          {/* Title */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">About HanziLens</h2>
          </div>

          {/* Description */}
          <div className="space-y-3 text-foreground">
            <p>
              HanziLens breaks down Chinese sentences into individual words and phrases,
              showing you the pinyin pronunciation and meaning of each segment.
            </p>
            <p>
              Click on any word to see its full dictionary entry with all possible meanings.
            </p>
          </div>

          {/* Usage */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">How to use</h3>
            <ol className="list-decimal list-inside space-y-1 text-foreground">
              <li>Paste or type a Chinese sentence</li>
              <li>Click <span className="font-semibold">Go</span></li>
              <li>Click on any word for more details</li>
            </ol>
          </div>

          {/* Example */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Example</h3>
            
            {/* Translation with alignment highlighting */}
            <div className="text-xl text-center text-foreground">
              "
              {exampleTranslationParts.map((part, idx) => (
                <TranslationSpan
                  key={idx}
                  part={part}
                  isHighlighted={isPartHighlighted(part, idx)}
                  highlightColor={getPartHighlightColor(part)}
                  onMouseEnter={() => setHoveredPartIndex(idx)}
                  onMouseLeave={() => setHoveredPartIndex(null)}
                />
              ))}
              "
            </div>

            {/* Segments with highlighting */}
            <div className="flex flex-wrap justify-center items-start gap-2 py-2">
              {exampleSegments.map((segment, index) => (
                <Segment
                  key={`${segment.token}-${index}`}
                  segment={segment}
                  highlightColor={highlightColors[index]}
                  isHighlighted={highlightedSegmentIds.has(segment.id)}
                  onMouseEnter={() => setHoveredSegmentId(segment.id)}
                  onMouseLeave={() => setHoveredSegmentId(null)}
                />
              ))}
            </div>

            <p className="text-sm text-muted-foreground text-center">
              Hover over words to see alignment highlighting!
            </p>
          </div>

          {/* Close button */}
          <div className="flex justify-center pt-2">
            <Button onClick={onClose} size="lg">
              Got it
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
