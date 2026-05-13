import { useMemo, useState } from 'react';
import { useIsDarkTheme } from '@/hooks/useIsDarkTheme';
import { generateHighlightColors } from '@/lib/colors';
import type { ParsedSegment, TranslationPart } from '@/types';

interface UseSegmentHighlightOptions {
  segments: ParsedSegment[];
  translationParts: TranslationPart[];
}

export interface SegmentHighlightState {
  /** Per-segment highlight colors. */
  highlightColors: string[];
  /** Map from segment id -> its highlight color. */
  segmentColorMap: Map<number, string>;
  /** Set of segment IDs currently highlighted (via hover). */
  highlightedSegmentIds: Set<number>;
  /** Currently hovered segment id, or null. */
  hoveredSegmentId: number | null;
  /** Currently hovered translation-part index, or null. */
  hoveredPartIndex: number | null;
  /** Set the hovered segment id. */
  setHoveredSegmentId: (id: number | null) => void;
  /** Set the hovered translation-part index. */
  setHoveredPartIndex: (index: number | null) => void;
  /** Returns true if a translation part should be highlighted. */
  isPartHighlighted: (part: TranslationPart, index: number) => boolean;
  /** Returns the highlight color for a translation part (first segment's color). */
  getPartHighlightColor: (part: TranslationPart) => string | undefined;
}

/**
 * Manages bidirectional hover-highlight state between segments and translation parts.
 *
 * Shared across ResultsView, SentenceCard, and HelpDialog.
 */
export function useSegmentHighlight({
  segments,
  translationParts,
}: UseSegmentHighlightOptions): SegmentHighlightState {
  const [hoveredSegmentId, setHoveredSegmentId] = useState<number | null>(null);
  const [hoveredPartIndex, setHoveredPartIndex] = useState<number | null>(null);
  const isDark = useIsDarkTheme();

  const highlightColors = useMemo(
    () => generateHighlightColors(segments.length, isDark),
    [segments.length, isDark],
  );

  const segmentColorMap = useMemo(() => {
    const map = new Map<number, string>();
    segments.forEach((seg, idx) => {
      map.set(seg.id, highlightColors[idx]);
    });
    return map;
  }, [segments, highlightColors]);

  const highlightedSegmentIds = useMemo(() => {
    if (hoveredSegmentId !== null) {
      return new Set([hoveredSegmentId]);
    }
    if (hoveredPartIndex !== null && translationParts[hoveredPartIndex]) {
      return new Set(translationParts[hoveredPartIndex].segmentIds);
    }
    return new Set<number>();
  }, [hoveredSegmentId, hoveredPartIndex, translationParts]);

  const isPartHighlighted = (part: TranslationPart, index: number): boolean => {
    if (hoveredSegmentId !== null) {
      return part.segmentIds.includes(hoveredSegmentId);
    }
    return hoveredPartIndex === index && part.segmentIds.length > 0;
  };

  const getPartHighlightColor = (part: TranslationPart): string | undefined => {
    if (part.segmentIds.length === 0) return undefined;
    return segmentColorMap.get(part.segmentIds[0]);
  };

  return {
    highlightColors,
    segmentColorMap,
    highlightedSegmentIds,
    hoveredSegmentId,
    hoveredPartIndex,
    setHoveredSegmentId,
    setHoveredPartIndex,
    isPartHighlighted,
    getPartHighlightColor,
  };
}
