import { useMemo, useRef, useState } from 'react';
import { ArrowLeft, CircleHelp, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { SentenceCard } from '@/components/SentenceCard';
import { MobileDictionaryModal } from '@/components/MobileDictionaryModal';
import { useIsMobile } from '@/hooks/useIsMobile';
import { generateHighlightColors } from '@/lib/colors';
import type { ParseResponse, ParsedSegment, SentenceChunk } from '@/types';

interface ParagraphResultsViewProps {
  text: string;
  isPreparing: boolean;
  error: string | null;
  sentences: SentenceChunk[];
  sentenceResults: Record<string, ParseResponse>;
  sentenceLoading: Record<string, boolean>;
  sentenceError: Record<string, string | null>;
  openSentenceIds: string[];
  onBack: () => void;
  onHelpClick: () => void;
  onSelectSentence: (sentenceId: string) => void;
}

export function ParagraphResultsView({
  text,
  isPreparing,
  error,
  sentences,
  sentenceResults,
  sentenceLoading,
  sentenceError,
  openSentenceIds,
  onBack,
  onHelpClick,
  onSelectSentence,
}: ParagraphResultsViewProps) {
  const isMobile = useIsMobile();
  const [hoveredSentenceId, setHoveredSentenceId] = useState<string | null>(null);
  const [pulseSentenceId, setPulseSentenceId] = useState<string | null>(null);
  const [selectedSegment, setSelectedSegment] = useState<ParsedSegment | null>(null);
  const [showTranslation, setShowTranslation] = useState(false);
  const isDark = document.documentElement.classList.contains('dark');
  const sentenceRefs = useRef(new Map<string, HTMLDivElement>());

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

  const openSentenceSet = useMemo(() => new Set(openSentenceIds), [openSentenceIds]);
  const hasLoading = useMemo(
    () => sentences.some((sentence) => sentenceLoading[sentence.id]),
    [sentences, sentenceLoading]
  );
  const translationText = useMemo(() => {
    const parts = sentences
      .map((sentence) => sentenceResults[sentence.id]?.translation)
      .filter((value): value is string => !!value && value.trim().length > 0);
    return parts.join(' ').trim();
  }, [sentences, sentenceResults]);
  const translationFallback = isPreparing || hasLoading
    ? 'Translating...'
    : 'Translation unavailable.';
  const translationDisplay = translationText || translationFallback;
  const originalTextSegments = useMemo(() => {
    if (!text) return [] as Array<{ type: 'plain' | 'sentence'; text: string; sentenceId?: string }>;

    const ranges = [...sentences]
      .filter((sentence) => Number.isFinite(sentence.startOffset) && Number.isFinite(sentence.endOffset))
      .sort((a, b) => a.startOffset - b.startOffset);

    const segments: Array<{ type: 'plain' | 'sentence'; text: string; sentenceId?: string }> = [];
    let cursor = 0;

    ranges.forEach((sentence) => {
      const start = Math.max(0, Math.min(text.length, sentence.startOffset));
      const end = Math.max(start, Math.min(text.length, sentence.endOffset));

      if (end <= cursor) return;

      if (start > cursor) {
        segments.push({ type: 'plain', text: text.slice(cursor, start) });
      }

      if (end > start) {
        segments.push({
          type: 'sentence',
          text: text.slice(start, end),
          sentenceId: sentence.id,
        });
      }

      cursor = Math.max(cursor, end);
    });

    if (cursor < text.length) {
      segments.push({ type: 'plain', text: text.slice(cursor) });
    }

    return segments;
  }, [text, sentences]);

  const handleSentenceClick = (sentenceId: string) => {
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

      <div className="pt-16 pb-10 max-w-4xl mx-auto space-y-6">
        {(showTranslation ? translationDisplay : text) && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="text-xs font-semibold text-muted-foreground mb-2">
              {showTranslation ? 'Translation' : 'Original text'}
            </div>
            <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed text-left">
              {showTranslation
                ? translationDisplay
                : originalTextSegments.map((segment, index) => {
                    if (segment.type === 'plain') {
                      return <span key={`plain-${index}`}>{segment.text}</span>;
                    }

                    const sentenceId = segment.sentenceId;
                    const color = sentenceId
                      ? sentenceColorMap.get(sentenceId) || 'rgba(59, 130, 246, 0.2)'
                      : 'rgba(59, 130, 246, 0.2)';
                    const isActive = sentenceId
                      ? openSentenceSet.has(sentenceId) || sentenceId === hoveredSentenceId
                      : false;
                    const backgroundColor = setAlpha(color, isActive ? 0.35 : 0.2);
                    const borderColor = setAlpha(color, isActive ? 0.7 : 0.45);

                    return (
                      <button
                        key={`sentence-${sentenceId}-${index}`}
                        type="button"
                        onClick={() => sentenceId && handleSentenceClick(sentenceId)}
                        onMouseEnter={() => sentenceId && setHoveredSentenceId(sentenceId)}
                        onMouseLeave={() => setHoveredSentenceId(null)}
                        onFocus={() => sentenceId && setHoveredSentenceId(sentenceId)}
                        onBlur={() => setHoveredSentenceId(null)}
                        className="inline-block align-baseline text-left rounded-sm px-0.5 py-0.5 transition-colors"
                        style={{
                          backgroundColor,
                          boxShadow: `inset 0 -1px 0 ${borderColor}`,
                        }}
                        aria-label="Jump to sentence"
                      >
                        {segment.text}
                      </button>
                    );
                  })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end">
          <div className="inline-flex rounded-full border border-border bg-background shadow-sm p-1">
            <button
              type="button"
              onClick={() => setShowTranslation(false)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                !showTranslation
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Original
            </button>
            <button
              type="button"
              onClick={() => setShowTranslation(true)}
              className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                showTranslation
                  ? 'bg-foreground text-background'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Translation
            </button>
          </div>
        </div>

        {error && (
          <div className="border border-destructive/30 bg-destructive/10 text-destructive text-sm rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {isPreparing && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Preparing sentences...
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
              const sentenceErr = sentenceError[sentenceId] || null;
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
                    error={sentenceErr}
                    result={result}
                    isActive={isActive}
                    isMobile={isMobile}
                    onToggle={() => onSelectSentence(sentenceId)}
                    onHover={() => setHoveredSentenceId(sentenceId)}
                    onHoverEnd={() => setHoveredSentenceId(null)}
                    onSegmentClick={(segment) => setSelectedSegment(segment)}
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

function setAlpha(color: string, alpha: number): string {
  const match = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([0-9.]+)\)/);
  if (!match) return color;
  return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha})`;
}
