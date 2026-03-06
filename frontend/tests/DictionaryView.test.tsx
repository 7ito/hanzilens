import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DictionaryView } from '@/components/DictionaryView';
import type { LookupResponse } from '@/types';

const sampleEntry = {
  id: 1,
  simplified: '你好',
  traditional: '你好',
  pinyin: 'ni3 hao3',
  definitions: ['hello', 'hi'],
};

const sampleEntryDiffTraditional = {
  id: 2,
  simplified: '国',
  traditional: '國',
  pinyin: 'guo2',
  definitions: ['country', 'nation'],
};

describe('DictionaryView', () => {
  it('renders spinner when loading', () => {
    render(<DictionaryView data={null} loading={true} />);
    // Loader2 renders an SVG with animate-spin class
    const spinner = document.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
  });

  it('renders error message when error is set', () => {
    render(<DictionaryView data={null} error="Lookup failed" />);
    expect(screen.getByText('Lookup failed')).toBeInTheDocument();
  });

  it('renders nothing when data is null and not loading', () => {
    const { container } = render(<DictionaryView data={null} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders "No entries found" when entries array is empty', () => {
    const data: LookupResponse = { entries: [] };
    render(<DictionaryView data={data} />);
    expect(screen.getByText('No entries found')).toBeInTheDocument();
  });

  it('renders dictionary entries with simplified characters', () => {
    const data: LookupResponse = { entries: [sampleEntry] };
    render(<DictionaryView data={data} />);
    expect(screen.getByText('你好')).toBeInTheDocument();
  });

  it('renders definitions separated by | dividers', () => {
    const data: LookupResponse = { entries: [sampleEntry] };
    render(<DictionaryView data={data} />);
    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('hi')).toBeInTheDocument();
    expect(screen.getByText('|')).toBeInTheDocument();
  });

  it('renders pinyin with tone-colored syllables', () => {
    const data: LookupResponse = { entries: [sampleEntry] };
    const { container } = render(<DictionaryView data={data} />);
    // The pinyin "ni3 hao3" should be converted to accented form "nǐ hǎo"
    // Each syllable is wrapped in a span with a style color
    const coloredSpans = container.querySelectorAll('span[style]');
    expect(coloredSpans.length).toBeGreaterThan(0);
  });

  it('shows simplified/traditional when they differ', () => {
    const data: LookupResponse = { entries: [sampleEntryDiffTraditional] };
    const { container } = render(<DictionaryView data={data} />);
    // The text is split: 国 + <span>/</span> + 國 inside one parent span
    // Use textContent to check the parent contains both
    const charSpan = container.querySelector('.text-lg.font-medium');
    expect(charSpan?.textContent).toContain('国');
    expect(charSpan?.textContent).toContain('國');
    expect(charSpan?.textContent).toContain('/');
  });

  it('does not show "/" when simplified equals traditional', () => {
    const data: LookupResponse = { entries: [sampleEntry] };
    render(<DictionaryView data={data} />);
    expect(screen.queryByText('/')).not.toBeInTheDocument();
  });

  it('shows segment badges when segments length > 1', () => {
    const data: LookupResponse = {
      entries: [sampleEntry],
      segments: ['你', '好'],
    };
    render(<DictionaryView data={data} />);
    // Badge components should render the segment text
    expect(screen.getByText('你')).toBeInTheDocument();
    expect(screen.getByText('好')).toBeInTheDocument();
  });

  it('does not show segment badges when only one segment', () => {
    const data: LookupResponse = {
      entries: [sampleEntry],
      segments: ['你好'],
    };
    const { container } = render(<DictionaryView data={data} />);
    // No badge container should be rendered
    const badgeContainer = container.querySelector('.flex.flex-wrap.gap-1');
    expect(badgeContainer).toBeFalsy();
  });

  it('renders multiple dictionary entries', () => {
    const data: LookupResponse = {
      entries: [sampleEntry, sampleEntryDiffTraditional],
    };
    const { container } = render(<DictionaryView data={data} />);
    // Both entries should be rendered
    expect(screen.getByText('你好')).toBeInTheDocument();
    // 国 is split across elements, check via container
    const entryDivs = container.querySelectorAll('.py-3.border-b');
    expect(entryDivs).toHaveLength(2);
    expect(entryDivs[1].textContent).toContain('国');
  });
});
