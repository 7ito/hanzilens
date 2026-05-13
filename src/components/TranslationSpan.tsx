import type { TranslationPart } from '@/types';

interface TranslationSpanProps {
  part: TranslationPart;
  isHighlighted: boolean;
  highlightColor?: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

/**
 * Renders a single part of the translation with hover highlighting.
 * Only interactive (hoverable) if the part has segment references.
 */
export function TranslationSpan({
  part,
  isHighlighted,
  highlightColor,
  onMouseEnter,
  onMouseLeave,
}: TranslationSpanProps) {
  const isInteractive = part.segmentIds.length > 0;

  return (
    <span
      onMouseEnter={isInteractive ? onMouseEnter : undefined}
      onMouseLeave={isInteractive ? onMouseLeave : undefined}
      className={`
        transition-all duration-150
        ${isInteractive ? 'cursor-pointer' : ''}
        ${isHighlighted ? 'rounded-sm' : ''}
      `}
      style={{
        backgroundColor: isHighlighted ? highlightColor : undefined,
      }}
    >
      {part.text}
    </span>
  );
}
