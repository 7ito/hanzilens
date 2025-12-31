import { useState, useMemo } from 'react';
import { ArrowLeft, Loader2, CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segment } from './Segment';
import { TranslationSpan } from './TranslationSpan';
import { ThemeToggle } from './ThemeToggle';
import { generateHighlightColors } from '@/lib/colors';
import type { ParsedSegment, TranslationPart } from '@/types';

interface ResultsViewProps {
  translation: string;
  translationParts: TranslationPart[];
  segments: ParsedSegment[];
  isLoading: boolean;
  onBack: () => void;
  onHelpClick: () => void;
}

export function ResultsView({
  translation,
  translationParts,
  segments,
  isLoading,
  onBack,
  onHelpClick,
}: ResultsViewProps) {
  // Track which segment is being hovered (by id)
  const [hoveredSegmentId, setHoveredSegmentId] = useState<number | null>(null);
  // Track which translation part is being hovered (by index)
  const [hoveredPartIndex, setHoveredPartIndex] = useState<number | null>(null);

  // Detect dark mode for color generation
  const isDark = document.documentElement.classList.contains('dark');

  // Generate highlight colors for all segments
  const highlightColors = useMemo(
    () => generateHighlightColors(segments.length, isDark),
    [segments.length, isDark]
  );

  // Build a map from segment id to its color
  const segmentColorMap = useMemo(() => {
    const map = new Map<number, string>();
    segments.forEach((seg, idx) => {
      map.set(seg.id, highlightColors[idx]);
    });
    return map;
  }, [segments, highlightColors]);

  // Determine which segment IDs should be highlighted
  const highlightedSegmentIds = useMemo(() => {
    if (hoveredSegmentId !== null) {
      return new Set([hoveredSegmentId]);
    }
    if (hoveredPartIndex !== null && translationParts[hoveredPartIndex]) {
      return new Set(translationParts[hoveredPartIndex].segmentIds);
    }
    return new Set<number>();
  }, [hoveredSegmentId, hoveredPartIndex, translationParts]);

  // Check if a translation part should be highlighted
  const isPartHighlighted = (part: TranslationPart): boolean => {
    if (hoveredSegmentId !== null) {
      return part.segmentIds.includes(hoveredSegmentId);
    }
    return false;
  };

  // Get highlight color for a translation part (use first matching segment's color)
  const getPartHighlightColor = (part: TranslationPart): string | undefined => {
    if (part.segmentIds.length === 0) return undefined;
    // Use the first segment's color
    return segmentColorMap.get(part.segmentIds[0]);
  };

  // Check if we have valid translationParts for alignment highlighting
  const hasAlignmentData = translationParts.length > 0;

  return (
    <div className="min-h-screen p-4">
      {/* Header with back button */}
      <div className="fixed top-4 left-4 z-10">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Header controls */}
      <div className="fixed top-4 right-4 z-10 flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onHelpClick} title="Help">
          <CircleHelp className="size-5" />
        </Button>
        <ThemeToggle />
      </div>

      {/* Main content */}
      <div className="pt-16 pb-8 max-w-4xl mx-auto">
        {/* Translation - with or without alignment highlighting */}
        {translation && (
          <div className="text-xl md:text-2xl lg:text-3xl text-center text-foreground mb-8">
            {hasAlignmentData ? (
              // Render with alignment highlighting
              translationParts.map((part, idx) => (
                <TranslationSpan
                  key={idx}
                  part={part}
                  isHighlighted={
                    isPartHighlighted(part) ||
                    (hoveredPartIndex === idx && part.segmentIds.length > 0)
                  }
                  highlightColor={getPartHighlightColor(part)}
                  onMouseEnter={() => setHoveredPartIndex(idx)}
                  onMouseLeave={() => setHoveredPartIndex(null)}
                />
              ))
            ) : (
              // Fallback to plain translation
              translation
            )}
          </div>
        )}

        {/* Segments */}
        <div className="flex flex-wrap justify-center items-start gap-2">
          {segments.map((segment, index) => (
            <Segment
              key={segment.id ?? `${segment.token}-${index}`}
              segment={segment}
              highlightColor={highlightColors[index]}
              isHighlighted={highlightedSegmentIds.has(segment.id)}
              onMouseEnter={() => setHoveredSegmentId(segment.id)}
              onMouseLeave={() => setHoveredSegmentId(null)}
            />
          ))}
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex items-center justify-center mt-8">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Analyzing...</span>
          </div>
        )}
      </div>
    </div>
  );
}
