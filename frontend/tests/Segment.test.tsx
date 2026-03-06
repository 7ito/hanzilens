import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ParsedSegment } from '@/types';

// Mock posthog before importing Segment
vi.mock('posthog-js', () => ({
  default: { capture: vi.fn() },
}));

// Mock DictionaryPopup to avoid its complexity
vi.mock('@/components/DictionaryPopup', () => ({
  DictionaryPopup: () => <div data-testid="dictionary-popup" />,
}));

import { Segment } from '@/components/Segment';

const chineseSegment: ParsedSegment = {
  id: 0,
  token: '你好',
  pinyin: 'ni3 hao3',
  definition: 'hello',
};

const punctuationSegment: ParsedSegment = {
  id: 1,
  token: '。',
  pinyin: '',
  definition: '',
};

const numberSegment: ParsedSegment = {
  id: 2,
  token: '123',
  pinyin: '',
  definition: '',
};

const emptySegment: ParsedSegment = {
  id: 3,
  token: '',
  pinyin: '',
  definition: '',
};

describe('Segment', () => {
  it('returns null for segment with empty token', () => {
    const { container } = render(<Segment segment={emptySegment} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders non-Chinese segment without cursor-pointer', () => {
    const { container } = render(<Segment segment={punctuationSegment} />);
    expect(container.textContent).toContain('。');
    // Non-clickable segments should not have cursor-pointer
    expect(container.querySelector('.cursor-pointer')).toBeFalsy();
  });

  it('renders number segment without cursor-pointer', () => {
    const { container } = render(<Segment segment={numberSegment} />);
    expect(container.textContent).toContain('123');
    expect(container.querySelector('.cursor-pointer')).toBeFalsy();
  });

  it('renders Chinese segment with pinyin and definition', () => {
    render(<Segment segment={chineseSegment} />);
    // Should render the definition text
    expect(screen.getByText('hello')).toBeInTheDocument();
    // Should render the characters
    expect(screen.getByText('你')).toBeInTheDocument();
    expect(screen.getByText('好')).toBeInTheDocument();
  });

  it('renders Chinese segment as clickable', () => {
    const { container } = render(<Segment segment={chineseSegment} />);
    expect(container.querySelector('.cursor-pointer')).toBeTruthy();
  });

  it('renders pinyin syllables with tone colors', () => {
    const { container } = render(<Segment segment={chineseSegment} />);
    // Pinyin syllables are rendered with style={{ color }} 
    const coloredSpans = container.querySelectorAll('span[style]');
    expect(coloredSpans.length).toBeGreaterThan(0);
  });

  it('applies highlight color when isHighlighted is true', () => {
    const { container } = render(
      <Segment segment={chineseSegment} isHighlighted={true} highlightColor="rgba(255, 0, 0, 0.2)" />
    );
    const highlightedEl = container.querySelector('[style*="background-color"]');
    expect(highlightedEl).toBeTruthy();
  });

  it('calls onSegmentClick when provided and segment is clicked', () => {
    const onClick = vi.fn();
    const { container } = render(
      <Segment segment={chineseSegment} onSegmentClick={onClick} />
    );
    const clickable = container.querySelector('.cursor-pointer');
    fireEvent.click(clickable!);
    expect(onClick).toHaveBeenCalledWith(chineseSegment);
  });

  it('does not call onSegmentClick for non-Chinese segments', () => {
    const onClick = vi.fn();
    const { container } = render(
      <Segment segment={punctuationSegment} onSegmentClick={onClick} />
    );
    // Click on the segment
    fireEvent.click(container.firstChild!);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('calls onMouseEnter and onMouseLeave callbacks', () => {
    const onEnter = vi.fn();
    const onLeave = vi.fn();
    const { container } = render(
      <Segment segment={chineseSegment} onMouseEnter={onEnter} onMouseLeave={onLeave} />
    );
    const clickable = container.querySelector('.cursor-pointer');
    fireEvent.mouseEnter(clickable!);
    expect(onEnter).toHaveBeenCalled();
    fireEvent.mouseLeave(clickable!);
    expect(onLeave).toHaveBeenCalled();
  });

  it('does not render DictionaryPopup initially', () => {
    render(<Segment segment={chineseSegment} />);
    expect(screen.queryByTestId('dictionary-popup')).not.toBeInTheDocument();
  });
});
