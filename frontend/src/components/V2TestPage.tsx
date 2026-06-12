import { useState } from 'react';
import { Loader2, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Segment } from './Segment';
import { TranslationSpan } from './TranslationSpan';
import { ThemeToggle } from './ThemeToggle';
import { MobileDictionaryModal } from './MobileDictionaryModal';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useSegmentHighlight } from '@/hooks/useSegmentHighlight';
import { useParseV2, type ParseV2Timings } from '@/hooks/useParseV2';
import type { GrammarPoint, ParsedSegment } from '@/types';

const CHAR_LIMIT = 500;

function TimingStrip({ timings }: { timings: ParseV2Timings }) {
  const entries: Array<[string, number | null]> = [
    ['provisional', timings.provisionalMs],
    ['first LLM', timings.firstLlmMs],
    ['total', timings.totalMs],
  ];

  if (entries.every(([, value]) => value === null)) return null;

  return (
    <div className="flex justify-center gap-4 text-xs text-muted-foreground font-mono mt-6">
      {entries.map(([label, value]) => (
        <span key={label}>
          {label}: {value === null ? '…' : `${value}ms`}
        </span>
      ))}
    </div>
  );
}

interface GrammarCardProps {
  point: GrammarPoint;
  onHover: (segmentIds: number[] | null) => void;
}

function GrammarCard({ point, onHover }: GrammarCardProps) {
  return (
    <Card
      className="transition-colors hover:border-primary/50"
      onMouseEnter={() => onHover(point.segmentIds)}
      onMouseLeave={() => onHover(null)}
    >
      <CardContent className="pt-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-semibold">{point.name}</span>
          <Badge variant="secondary">{point.level}</Badge>
        </div>
        <div className="text-sm font-mono text-muted-foreground mb-2">{point.template}</div>
        <p className="text-sm text-foreground/90">{point.explanation}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Test page for the v2 parse pipeline (/parse2), mounted at /v2.
 *
 * Renders provisional CEDICT segments instantly (dimmed), replaces them as
 * LLM segments stream in, and shows hydrated grammar points below the
 * results. Hovering a grammar card highlights the segments it spans.
 */
export function V2TestPage() {
  const [text, setText] = useState('');
  const [selectedSegment, setSelectedSegment] = useState<ParsedSegment | null>(null);
  const [grammarHoverIds, setGrammarHoverIds] = useState<number[] | null>(null);
  const isMobile = useIsMobile();

  const {
    isLoading,
    error,
    translation,
    translationParts,
    segments,
    grammarPoints,
    timings,
    parse,
  } = useParseV2();

  const {
    highlightColors,
    segmentColorMap,
    highlightedSegmentIds,
    setHoveredSegmentId,
    setHoveredPartIndex,
    isPartHighlighted,
    getPartHighlightColor,
  } = useSegmentHighlight({ segments, translationParts });

  const charCount = text.length;
  const isOverLimit = charCount > CHAR_LIMIT;
  const canSubmit = text.trim().length > 0 && !isOverLimit && !isLoading;
  const hasAlignmentData = translationParts.length > 0;
  const hasResults = segments.length > 0 || translation || isLoading;

  // Grammar-card hover takes precedence over segment/translation hover
  const effectiveHighlightedIds = grammarHoverIds
    ? new Set(grammarHoverIds)
    : highlightedSegmentIds;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setGrammarHoverIds(null);
    void parse(text.trim());
  };

  return (
    <div className="min-h-screen bg-background text-foreground p-4">
      {/* Header */}
      <div className="fixed top-4 left-4 z-10 flex items-center gap-2 text-sm text-muted-foreground">
        <Zap className="size-4" />
        <span className="font-semibold text-foreground">v2 pipeline test</span>
        <a href="/" className="underline hover:text-foreground">
          v1
        </a>
      </div>
      <div className="fixed top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="pt-16 pb-8 max-w-4xl mx-auto">
        {/* Input */}
        <Card className="mb-8">
          <CardContent className="pt-4">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              placeholder="我是去年来北京的，可是我的中文还没有他说得那么好。"
              className="min-h-20 text-lg"
            />
            <div className="flex items-center justify-between mt-3">
              <span className={`text-xs ${isOverLimit ? 'text-destructive' : 'text-muted-foreground'}`}>
                {charCount}/{CHAR_LIMIT}
              </span>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {isLoading ? <Loader2 className="size-4 animate-spin mr-1" /> : null}
                Parse
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="text-center text-destructive mb-8">{error}</div>
        )}

        {/* Results */}
        {hasResults && (
          <>
            {/* Translation with alignment highlighting */}
            <div className="text-xl md:text-2xl lg:text-3xl text-center text-foreground mb-8 min-h-9">
              {translation ? (
                hasAlignmentData ? (
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
                  translation
                )
              ) : (
                isLoading && (
                  <span className="text-muted-foreground text-base">Translating…</span>
                )
              )}
            </div>

            {/* Segments — provisional ones render dimmed until the LLM confirms */}
            <div className="flex flex-wrap justify-center items-start gap-2">
              {segments.map((segment, index) => (
                <div
                  key={segment.id ?? `${segment.token}-${index}`}
                  className={segment.provisional ? 'opacity-50' : undefined}
                >
                  <Segment
                    segment={segment}
                    highlightColor={
                      grammarHoverIds ? segmentColorMap.get(segment.id) : highlightColors[index]
                    }
                    isHighlighted={effectiveHighlightedIds.has(segment.id)}
                    onMouseEnter={() => setHoveredSegmentId(segment.id)}
                    onMouseLeave={() => setHoveredSegmentId(null)}
                    onSegmentClick={isMobile ? setSelectedSegment : undefined}
                    enablePopup={!isMobile}
                  />
                </div>
              ))}
            </div>

            {/* Grammar points */}
            {grammarPoints.length > 0 && (
              <div className="mt-10">
                <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                  Grammar
                </h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {grammarPoints.map((point, idx) => (
                    <GrammarCard
                      key={`${point.patternId}-${idx}`}
                      point={point}
                      onHover={setGrammarHoverIds}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex items-center justify-center mt-8">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">Analyzing...</span>
              </div>
            )}

            <TimingStrip timings={timings} />
          </>
        )}
      </div>

      <MobileDictionaryModal
        segment={selectedSegment}
        onClose={() => setSelectedSegment(null)}
      />
    </div>
  );
}

export default V2TestPage;
