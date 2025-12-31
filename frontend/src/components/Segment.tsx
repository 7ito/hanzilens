import { useState } from 'react';
import { convertPinyin, getToneColor } from '@/lib/pinyin';
import type { ParsedSegment } from '@/types';
import { DictionaryPopup } from './DictionaryPopup';

interface SegmentProps {
  segment: ParsedSegment;
}

/**
 * Displays a single Chinese character/word segment with pinyin and definition.
 * Clicking opens a dictionary popup.
 */
export function Segment({ segment }: SegmentProps) {
  const [showPopup, setShowPopup] = useState(false);
  const { token, pinyin, definition } = segment;

  // Guard against incomplete segment data during streaming
  if (!token) {
    return null;
  }

  // Convert pinyin to accented form with tone info
  const converted = convertPinyin(pinyin || '');
  const characters = token.split('');

  // Check if this is a clickable segment (has pinyin/definition)
  const isClickable = pinyin || definition;

  const handleClick = () => {
    if (isClickable) {
      setShowPopup(!showPopup);
    }
  };

  // For punctuation or non-Chinese text, render with same structure as clickable
  // segments to maintain vertical alignment (empty pinyin space + character + empty definition)
  if (!isClickable) {
    return (
      <div className="flex flex-col items-center px-1 py-2">
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
    <div className="relative">
      <div
        onClick={handleClick}
        className={`
          flex flex-col items-center justify-center px-4 py-2 cursor-pointer
          transition-all duration-200 rounded-lg
          hover:bg-accent/10
          ${showPopup ? 'bg-accent/20 ring-2 ring-accent' : ''}
        `}
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

      {/* Dictionary Popup */}
      {showPopup && (
        <DictionaryPopup token={token} onClose={() => setShowPopup(false)} />
      )}
    </div>
  );
}
