import { useMemo } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { Segment } from '@/components/Segment';
import { TranslationSpan } from '@/components/TranslationSpan';
import { useSegmentHighlight } from '@/hooks/useSegmentHighlight';
import { setAlpha } from '@/lib/style-utils';
import type { ParseResponse, ParsedSegment, SentenceChunk, TranslationPart } from '@/types';

function isTranslationPart(value: unknown): value is TranslationPart {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as { text?: unknown; segmentIds?: unknown };
  return typeof candidate.text === 'string' && Array.isArray(candidate.segmentIds);
}

export function SentenceCard({
  sentence,
  color,
  isExpanded,
  isLoading,
  error,
  result,
  isActive,
  isMobile,
  onToggle,
  onHover,
  onHoverEnd,
  onSegmentClick,
}: {
  sentence: SentenceChunk;
  color: string;
  isExpanded: boolean;
  isLoading: boolean;
  error: string | null;
  result?: ParseResponse;
  isActive: boolean;
  isMobile: boolean;
  onToggle: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
  onSegmentClick?: (segment: ParsedSegment) => void;
}) {
  const segments = result?.segments ?? [];
  const translation = result?.translation ?? '';
  const translationParts = useMemo(
    () => (result?.translationParts ?? []).filter(isTranslationPart),
    [result?.translationParts]
  );
  const hasAlignmentData = translationParts.length > 0;

  const {
    highlightColors,
    highlightedSegmentIds,
    setHoveredSegmentId,
    setHoveredPartIndex,
    isPartHighlighted,
    getPartHighlightColor,
  } = useSegmentHighlight({ segments, translationParts });

  return (
    <div
      className={`rounded-lg border bg-card transition-shadow ${
        isActive ? 'shadow-md' : 'shadow-sm'
      }`}
      style={{ borderLeft: `4px solid ${setAlpha(color, 0.7)}` }}
      onMouseEnter={onHover}
      onMouseLeave={onHoverEnd}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full text-left px-4 py-3"
        aria-expanded={isExpanded}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="text-base font-medium text-foreground leading-relaxed">
              {sentence.text}
            </div>
            {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>
          <ChevronDown
            className={`size-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </div>
        {error && !isExpanded && (
          <div className="text-xs text-destructive mt-1">{error}</div>
        )}
      </button>

      <div
        className={`grid transition-all duration-200 ease-out ${
          isExpanded
            ? 'grid-rows-[1fr] opacity-100 translate-y-0'
            : 'grid-rows-[0fr] opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-4 pb-4 space-y-4">
            {error && <div className="text-sm text-destructive">{error}</div>}

            {translation && (
              <div className="text-lg text-foreground">
                {hasAlignmentData
                  ? translationParts.map((part, idx) => (
                      <TranslationSpan
                        key={idx}
                        part={part}
                        isHighlighted={isPartHighlighted(part, idx)}
                        highlightColor={getPartHighlightColor(part)}
                        onMouseEnter={() => setHoveredPartIndex(idx)}
                        onMouseLeave={() => setHoveredPartIndex(null)}
                      />
                    ))
                  : translation}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {segments.map((segment, index) => (
                <Segment
                  key={`${segment.id}-${index}`}
                  segment={segment}
                  highlightColor={highlightColors[index]}
                  isHighlighted={highlightedSegmentIds.has(segment.id)}
                  onMouseEnter={() => setHoveredSegmentId(segment.id)}
                  onMouseLeave={() => setHoveredSegmentId(null)}
                  onSegmentClick={isMobile ? onSegmentClick : undefined}
                  enablePopup={!isMobile}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
