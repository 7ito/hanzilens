import { useState, useRef } from 'react';
import posthog from 'posthog-js';
import { convertPinyin, getToneColor } from '@/lib/pinyin';
import { AnalyticsEvents } from '@/hooks/useAnalytics';
import type { ParsedSegment } from '@/types';
import { DictionaryPopup } from './DictionaryPopup';

/**
 * Check if a string contains at least one Chinese character
 */
function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

interface SegmentProps {
  segment: ParsedSegment;
  highlightColor?: string;
  isHighlighted?: boolean;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const POPUP_WIDTH = 300; // matches w-[300px] in DictionaryPopup

/**
 * Displays a single Chinese character/word segment with pinyin and definition.
 * Clicking opens a dictionary popup.
 * Supports highlight colors for translation alignment feature.
 */
export function Segment({
  segment,
  highlightColor,
  isHighlighted = false,
  onMouseEnter,
  onMouseLeave,
}: SegmentProps) {
  const [showPopup, setShowPopup] = useState(false);
  const [popupPosition, setPopupPosition] = useState<{ x: number; y: number } | null>(null);
  const segmentRef = useRef<HTMLDivElement>(null);
  const { token, pinyin, definition } = segment;

  // Guard against incomplete segment data during streaming
  if (!token) {
    return null;
  }

  // Convert pinyin to accented form with tone info
  const converted = convertPinyin(pinyin || '');
  const characters = token.split('');

  // Check if this is a clickable segment (must contain Chinese characters)
  // Non-Chinese text like punctuation, numbers, or Latin letters should not open dictionary
  const isClickable = containsChinese(token);

  const handleClick = () => {
    if (isClickable && segmentRef.current) {
      if (!showPopup) {
        // Calculate position when opening popup
        const rect = segmentRef.current.getBoundingClientRect();
        const x = rect.left + rect.width / 2 - POPUP_WIDTH / 2;
        const y = rect.bottom + 8; // 8px gap below segment
        setPopupPosition({ x, y });
        
        // Track dictionary open event
        posthog.capture(AnalyticsEvents.DICTIONARY_OPENED, {
          word: token,
        });
      }
      setShowPopup(!showPopup);
    }
  };

  // For punctuation or non-Chinese text, render with same structure as clickable
  // segments to maintain vertical alignment (empty pinyin space + character + empty definition)
  // Still support highlighting for translation alignment
  if (!isClickable) {
    return (
      <div
        className={`
          flex flex-col items-center px-1 py-2
          transition-all duration-150 rounded-lg
          ${isHighlighted ? '' : ''}
        `}
        style={{
          backgroundColor: isHighlighted ? highlightColor : undefined,
        }}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        {/* Pinyin + Character structure matching clickable segments */}
        <div className="flex flex-row items-end">
          <div className="flex flex-col items-center">
            {/* Empty pinyin space with same styling as clickable segments */}
            <span className="text-sm md:text-base lg:text-lg font-medium">&nbsp;</span>
            {/* Character/punctuation */}
            <span className="text-2xl md:text-3xl lg:text-4xl text-foreground">{token}</span>
          </div>
        </div>
        {/* Empty definition space with same styling */}
        <div className="text-xs md:text-sm text-muted-foreground mt-1">&nbsp;</div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={segmentRef}
        onClick={handleClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        className={`
          flex flex-col items-center justify-center px-4 py-2 cursor-pointer
          transition-all duration-150 rounded-lg
          hover:bg-accent/10
          ${showPopup ? 'bg-accent/20 ring-2 ring-accent' : ''}
        `}
        style={{
          backgroundColor: isHighlighted && !showPopup ? highlightColor : undefined,
        }}
      >
        {/* Pinyin + Character pairs */}
        <div className="flex flex-row items-end gap-0.5">
          {characters.map((char, index) => {
            const syllable = converted.syllables[index];
            const color = syllable ? getToneColor(syllable.tone) : undefined;

            return (
              <div key={index} className="flex flex-col items-center">
                {/* Pinyin */}
                <span
                  className="text-sm md:text-base lg:text-lg font-medium"
                  style={{ color }}
                >
                  {syllable?.text || '\u00A0'}
                </span>
                {/* Character */}
                <span
                  className="text-2xl md:text-3xl lg:text-4xl"
                  style={{ color }}
                >
                  {char}
                </span>
              </div>
            );
          })}
        </div>

        {/* Definition */}
        <div className="text-xs md:text-sm text-muted-foreground mt-1 text-center max-w-[150px] line-clamp-2">
          {definition}
        </div>
      </div>

      {/* Dictionary Popup - rendered via portal */}
      {showPopup && popupPosition && (
        <DictionaryPopup 
          token={token} 
          onClose={() => setShowPopup(false)}
          initialPosition={popupPosition}
        />
      )}
    </>
  );
}
