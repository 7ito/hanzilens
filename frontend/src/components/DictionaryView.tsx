import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { convertPinyin, getToneColor } from '@/lib/pinyin';
import type { DictionaryEntry, LookupResponse } from '@/types';

/**
 * Single dictionary entry display with pinyin tone colors
 */
function DictionaryEntryItem({ entry }: { entry: DictionaryEntry }) {
  const converted = convertPinyin(entry.pinyin);

  return (
    <div className="py-3 border-b border-border last:border-b-0">
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

interface DictionaryViewProps {
  /** Dictionary lookup response data */
  data: LookupResponse | null;
  /** Whether data is currently loading */
  loading?: boolean;
  /** Error message if lookup failed */
  error?: string | null;
}

/**
 * Shared dictionary content renderer.
 * Used by both DictionaryPopup (desktop) and MobileDictionaryModal (mobile).
 * 
 * Displays:
 * - Loading state
 * - Error state
 * - Segment badges (if word was broken into parts)
 * - Dictionary entries with pinyin and definitions
 */
export function DictionaryView({ data, loading, error }: DictionaryViewProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-destructive text-sm py-4 text-center">{error}</div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div>
      {/* Show segments if recursive breakdown was used */}
      {data.segments && data.segments.length > 1 && (
        <div className="flex flex-wrap gap-1 mb-3 pb-3 border-b">
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
        <div className="text-muted-foreground text-sm py-4 text-center">
          No entries found
        </div>
      )}
    </div>
  );
}
