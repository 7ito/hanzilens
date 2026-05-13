import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock child components and hooks
vi.mock('@/hooks/useAnalytics', () => ({
  useAnalytics: () => ({
    trackEvent: vi.fn(),
    trackPageView: vi.fn(),
    posthog: null,
  }),
  AnalyticsEvents: {
    PARSE_SUBMITTED: 'parse_submitted',
  },
}));

vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock('@/components/ImageInput', () => ({
  ImageInput: ({ onImageSelect, selectedImage }: { onImageSelect: (img: string | null) => void; selectedImage: string | null }) => (
    <div data-testid="image-input">
      <button data-testid="select-image" onClick={() => onImageSelect('data:image/jpeg;base64,test')}>
        Select Image
      </button>
      <button data-testid="clear-image" onClick={() => onImageSelect(null)}>
        Clear Image
      </button>
      {selectedImage && <span data-testid="image-preview">Image Selected</span>}
    </div>
  ),
}));

vi.mock('@/components/LogoA', () => ({
  LogoA: () => <div data-testid="logo" />,
}));

import { InputView } from '@/components/InputView';

describe('InputView', () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    isLoading: false,
    onHelpClick: vi.fn(),
  };

  it('renders the input form with title', () => {
    render(<InputView {...defaultProps} />);
    expect(screen.getByText('HanziLens')).toBeInTheDocument();
    expect(screen.getByText('Break down Chinese sentences!')).toBeInTheDocument();
  });

  it('renders the Go button', () => {
    render(<InputView {...defaultProps} />);
    expect(screen.getByText('Go')).toBeInTheDocument();
  });

  it('has submit button disabled when no input', () => {
    render(<InputView {...defaultProps} />);
    const button = screen.getByText('Go');
    expect(button).toBeDisabled();
  });

  it('enables submit button when text is entered', () => {
    render(<InputView {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '你好' } });
    const button = screen.getByText('Go');
    expect(button).not.toBeDisabled();
  });

  it('calls onSubmit with text ParseInput when submitted', () => {
    const onSubmit = vi.fn();
    render(<InputView {...defaultProps} onSubmit={onSubmit} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '你好世界' } });
    const button = screen.getByText('Go');
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'text',
      sentence: '你好世界',
    });
  });

  it('trims text before submitting', () => {
    const onSubmit = vi.fn();
    render(<InputView {...defaultProps} onSubmit={onSubmit} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '  你好  ' } });
    const button = screen.getByText('Go');
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledWith({
      type: 'text',
      sentence: '你好',
    });
  });

  it('shows character count', () => {
    render(<InputView {...defaultProps} />);
    expect(screen.getByText('0/1500')).toBeInTheDocument();
  });

  it('updates character count as user types', () => {
    render(<InputView {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '你好' } });
    expect(screen.getByText('2/1500')).toBeInTheDocument();
  });

  it('shows warning and disables submit when over character limit', () => {
    render(<InputView {...defaultProps} />);
    const textarea = screen.getByRole('textbox');
    const longText = '字'.repeat(1501);
    fireEvent.change(textarea, { target: { value: longText } });

    expect(screen.getByText(/Maximum character limit exceeded/)).toBeInTheDocument();
    const button = screen.getByText('Go');
    expect(button).toBeDisabled();
  });

  it('shows loading state with "Analyzing..." text', () => {
    render(<InputView {...defaultProps} isLoading={true} />);
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });

  it('disables submit button when loading', () => {
    render(<InputView {...defaultProps} isLoading={true} />);
    const button = screen.getByText('Analyzing...');
    expect(button.closest('button')).toBeDisabled();
  });

  it('submits on Enter key (not Shift+Enter)', () => {
    const onSubmit = vi.fn();
    render(<InputView {...defaultProps} onSubmit={onSubmit} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '你好' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
    expect(onSubmit).toHaveBeenCalled();
  });

  it('does not submit on Shift+Enter', () => {
    const onSubmit = vi.fn();
    render(<InputView {...defaultProps} onSubmit={onSubmit} />);
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '你好' } });
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with image ParseInput when image is selected', () => {
    const onSubmit = vi.fn();
    render(<InputView {...defaultProps} onSubmit={onSubmit} />);

    // Select image via mock ImageInput
    fireEvent.click(screen.getByTestId('select-image'));

    // Submit
    const button = screen.getByText('Go');
    fireEvent.click(button);

    expect(onSubmit).toHaveBeenCalledWith({
      type: 'image',
      image: 'data:image/jpeg;base64,test',
    });
  });

  it('hides textarea when image is selected', () => {
    render(<InputView {...defaultProps} />);

    // Textarea should be visible initially
    expect(screen.getByRole('textbox')).toBeInTheDocument();

    // Select image
    fireEvent.click(screen.getByTestId('select-image'));

    // Textarea should be hidden
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('does not submit with Enter when image is selected', () => {
    const onSubmit = vi.fn();
    render(<InputView {...defaultProps} onSubmit={onSubmit} />);

    // Enter text first
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: '你好' } });

    // Select image (clears text, hides textarea)
    fireEvent.click(screen.getByTestId('select-image'));

    // Enter key should not do anything since there's no textarea to trigger from
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onHelpClick when help button is clicked', () => {
    const onHelpClick = vi.fn();
    render(<InputView {...defaultProps} onHelpClick={onHelpClick} />);
    const helpButton = screen.getByTitle('Help');
    fireEvent.click(helpButton);
    expect(onHelpClick).toHaveBeenCalled();
  });
});
