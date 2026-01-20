import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, BookText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DictionaryView } from './DictionaryView';
import { lookupDefinition } from '@/lib/api';
import { convertPinyin, getToneColor } from '@/lib/pinyin';
import type { ParsedSegment, LookupResponse } from '@/types';

interface MobileDictionaryModalProps {
  /** The segment to display dictionary info for */
  segment: ParsedSegment | null;
  /** Callback when modal is closed */
  onClose: () => void;
}

/**
 * Full-screen dictionary modal for mobile devices.
 * Displays the segment's character, pinyin, and full dictionary entries.
 * 
 * Features:
 * - Full-screen overlay with slide-up animation
 * - Large character display at top
 * - Full dictionary entries below
 * - Link to MDBG for external lookup
 * - Close button at bottom for easy thumb reach
 */
export function MobileDictionaryModal({ segment, onClose }: MobileDictionaryModalProps) {
  const [data, setData] = useState<LookupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch dictionary data when segment changes
  useEffect(() => {
    if (!segment?.token) {
      setData(null);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const result = await lookupDefinition(segment!.token);
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
  }, [segment?.token]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (segment) {
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [segment]);

  // Don't render if no segment
  if (!segment) {
    return null;
  }

  const { token, pinyin, definition } = segment;
  const converted = convertPinyin(pinyin || '');

  const modal = (
    <div 
      className="fixed inset-0 z-50 bg-background flex flex-col animate-in slide-in-from-bottom duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dictionary-modal-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft className="size-4 mr-2" />
          Back
        </Button>
        <h2 id="dictionary-modal-title" className="font-semibold">Dictionary</h2>
        {/* MDBG Link */}
        <Button
          variant="ghost"
          size="sm"
          asChild
        >
          <a
            href={`https://www.mdbg.net/chinese/dictionary?wdqb=${encodeURIComponent(token)}`}
            target="_blank"
            rel="noopener noreferrer"
            title="View on MDBG"
          >
            <BookText className="size-4" />
          </a>
        </Button>
      </div>

      {/* Hero section - large character display */}
      <div className="text-center py-8 border-b bg-muted/30">
        {/* Characters with tone colors */}
        <div className="text-5xl mb-3">
          {token.split('').map((char, i) => {
            const syllable = converted.syllables[i];
            const color = syllable ? getToneColor(syllable.tone) : undefined;
            return (
              <span key={i} style={{ color }}>
                {char}
              </span>
            );
          })}
        </div>
        
        {/* Pinyin with tone colors */}
        <div className="text-xl mb-2">
          {converted.syllables.map((syllable, i) => (
            <span key={i} style={{ color: getToneColor(syllable.tone) }}>
              {syllable.text}{' '}
            </span>
          ))}
        </div>
        
        {/* Short definition from parsing */}
        <div className="text-muted-foreground">{definition}</div>
      </div>

      {/* Dictionary entries - scrollable */}
      <div className="flex-1 overflow-y-auto p-4">
        <DictionaryView data={data} loading={loading} error={error} />
      </div>

      {/* Close button - easy thumb reach on mobile */}
      <div className="p-4 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Button 
          onClick={onClose} 
          variant="secondary"
          className="w-full py-6 text-base"
        >
          Close
        </Button>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
