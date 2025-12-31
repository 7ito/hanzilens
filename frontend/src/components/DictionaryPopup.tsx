import { useEffect, useState, useRef } from 'react';
import Draggable from 'react-draggable';
import { X, BookText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { lookupDefinition } from '@/lib/api';
import { convertPinyin, getToneColor } from '@/lib/pinyin';
import { getNextZIndex } from '@/lib/zIndex';
import type { DictionaryEntry, LookupResponse } from '@/types';

interface DictionaryPopupProps {
  token: string;
  onClose: () => void;
}

/**
 * Entry component for a single dictionary result
 */
function DictionaryEntryItem({ entry }: { entry: DictionaryEntry }) {
  const converted = convertPinyin(entry.pinyin);

  return (
    <div className="py-2 border-b border-border last:border-b-0">
      {/* Header: Characters + Pinyin */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Simplified/Traditional */}
        <span className="text-lg font-medium">
          {entry.simplified === entry.traditional ? (
            entry.simplified
          ) : (
            <>
              {entry.simplified}
              <span className="text-muted-foreground mx-1">/</span>
              {entry.traditional}
            </>
          )}
        </span>

        {/* Pinyin with tone colors */}
        <span className="text-base">
          {converted.syllables.map((syllable, i) => (
            <span key={i} style={{ color: getToneColor(syllable.tone) }}>
              {syllable.text}{' '}
            </span>
          ))}
        </span>
      </div>

      {/* Definitions */}
      <div className="text-sm text-muted-foreground mt-1">
        {entry.definitions.map((def, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-1 text-accent">|</span>}
            {def}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DictionaryPopup({ token, onClose }: DictionaryPopupProps) {
  const [data, setData] = useState<LookupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zIndex, setZIndex] = useState(() => getNextZIndex());
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const result = await lookupDefinition(token);
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Bring popup to front when clicked/touched
  const bringToFront = () => {
    setZIndex(getNextZIndex());
  };

  return (
    <Draggable 
      handle=".drag-handle" 
      bounds="body" 
      nodeRef={nodeRef}
      onStart={bringToFront}
    >
      <div
        ref={nodeRef}
        className="absolute top-full left-1/2 -translate-x-1/2 mt-2"
        style={{ zIndex }}
        onMouseDown={bringToFront}
      >
        <Card 
          className="w-[300px] md:w-[400px] shadow-xl border-2 border-accent/30"
          onMouseDown={bringToFront}
        >
          {/* Draggable header */}
          <CardHeader className="drag-handle cursor-move py-2 px-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">{token}</CardTitle>
              <div className="flex items-center gap-1">
                {/* MDBG Link */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  asChild
                >
                  <a
                    href={`https://www.mdbg.net/chinese/dictionary?wdqb=${encodeURIComponent(token)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View on MDBG"
                  >
                    <BookText className="size-3.5" />
                  </a>
                </Button>
                {/* Close button */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onClose}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-3 max-h-[300px] overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="size-5 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="text-destructive text-sm py-2">{error}</div>
            )}

            {data && (
              <>
                {/* Show segments if recursive breakdown was used */}
                {data.segments && data.segments.length > 1 && (
                  <div className="flex flex-wrap gap-1 mb-2 pb-2 border-b">
                    {data.segments.map((seg, i) => (
                      <Badge key={i} variant="secondary">
                        {seg}
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Dictionary entries */}
                {data.entries.length > 0 ? (
                  data.entries.map((entry) => (
                    <DictionaryEntryItem key={entry.id} entry={entry} />
                  ))
                ) : (
                  <div className="text-muted-foreground text-sm py-2">
                    No entries found
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </Draggable>
  );
}
