import { useState } from 'react';
import { ArrowLeft, Loader2, CircleHelp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segment } from './Segment';
import { TranslationSpan } from './TranslationSpan';
import { ThemeToggle } from './ThemeToggle';
import { MobileDictionaryModal } from './MobileDictionaryModal';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSegmentHighlight } from '@/hooks/useSegmentHighlight';
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
  const [selectedSegment, setSelectedSegment] = useState<ParsedSegment | null>(null);
  const isMobile = useIsMobile();

  const {
    highlightColors,
    highlightedSegmentIds,
    setHoveredSegmentId,
    setHoveredPartIndex,
    isPartHighlighted,
    getPartHighlightColor,
  } = useSegmentHighlight({ segments, translationParts });

  const handleSegmentClick = (segment: ParsedSegment) => {
    setSelectedSegment(segment);
  };

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
                  isHighlighted={isPartHighlighted(part, idx)}
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
              onSegmentClick={isMobile ? handleSegmentClick : undefined}
              enablePopup={!isMobile}
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

      {/* Mobile dictionary modal */}
      <MobileDictionaryModal
        segment={selectedSegment}
        onClose={() => setSelectedSegment(null)}
      />
    </div>
  );
}
