import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Segment } from './Segment';
import type { ParsedSegment } from '@/types';

interface ResultsViewProps {
  translation: string;
  segments: ParsedSegment[];
  isLoading: boolean;
  onBack: () => void;
}

export function ResultsView({
  translation,
  segments,
  isLoading,
  onBack,
}: ResultsViewProps) {
  return (
    <div className="min-h-screen p-4">
      {/* Header with back button */}
      <div className="fixed top-4 left-4 z-10">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="size-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Main content */}
      <div className="pt-16 pb-8 max-w-4xl mx-auto">
        {/* Translation */}
        {translation && (
          <div className="text-xl md:text-2xl lg:text-3xl text-center text-foreground mb-8">
            {translation}
          </div>
        )}

        {/* Segments */}
        <div className="flex flex-wrap justify-center items-start gap-2">
          {segments.map((segment, index) => (
            <Segment key={`${segment.token}-${index}`} segment={segment} />
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
