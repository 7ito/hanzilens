import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { hasChineseText } from '@/lib/api';
import { Loader2, CircleHelp } from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';
import { ImageInput } from './ImageInput';
import type { ParseInput } from '@/types';

const CHAR_LIMIT = 150;
const MIN_CHINESE_RATIO = 0.25;

interface InputViewProps {
  onSubmit: (input: ParseInput) => void;
  isLoading: boolean;
  onHelpClick: () => void;
}

export function InputView({ onSubmit, isLoading, onHelpClick }: InputViewProps) {
  const [text, setText] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isTextValid, setIsTextValid] = useState(false);

  const charCount = text.length;
  const isOverLimit = charCount > CHAR_LIMIT;

  // Text is valid if it meets the Chinese ratio and length requirements
  useEffect(() => {
    setIsTextValid(hasChineseText(text, MIN_CHINESE_RATIO) && !isOverLimit);
  }, [text, isOverLimit]);

  // Can submit if we have valid text OR a selected image
  const canSubmit = (isTextValid || !!selectedImage) && !isLoading;

  const handleSubmit = () => {
    if (!canSubmit) return;

    if (selectedImage) {
      onSubmit({ type: 'image', image: selectedImage });
    } else {
      onSubmit({ type: 'text', sentence: text.trim() });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Only allow Enter submit for text input (not when image is selected)
    if (e.key === 'Enter' && !e.shiftKey && !selectedImage) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Handle image selection - clear text when image is selected
  const handleImageSelect = (imageDataUrl: string | null) => {
    setSelectedImage(imageDataUrl);
    if (imageDataUrl) {
      setText(''); // Clear text when image is selected
    }
  };

  // Handle text change - clear image when text is entered
  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (e.target.value && selectedImage) {
      setSelectedImage(null); // Clear image when text is entered
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Header controls */}
      <div className="absolute top-4 right-4 flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={onHelpClick} title="Help">
          <CircleHelp className="size-5" />
        </Button>
        <ThemeToggle />
      </div>

      <Card className="w-full max-w-2xl">
        <CardContent className="p-6 space-y-4">
          {/* Title */}
          <div className="text-center space-y-1">
            <h1 className="text-2xl md:text-3xl font-bold text-foreground">
              HanziLens
            </h1>
            <p className="text-sm text-muted-foreground">
              Break down Chinese sentences into segments
            </p>
          </div>

          {/* Text Input */}
          <Textarea
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="Paste or type a Chinese sentence here..."
            className="min-h-[150px] text-lg resize-none"
            disabled={isLoading || !!selectedImage}
          />

          {/* Validation Messages (only show for text input) */}
          {!selectedImage && (
            <div className="flex flex-col gap-1">
              {/* Character count */}
              <div
                className={`text-sm text-right ${
                  isOverLimit ? 'text-destructive' : 'text-muted-foreground'
                }`}
              >
                {charCount}/{CHAR_LIMIT}
              </div>

              {/* Chinese ratio warning */}
              {text.length > 1 && !hasChineseText(text, MIN_CHINESE_RATIO) && (
                <div className="text-sm text-destructive">
                  Please ensure at least 25% of text is Chinese characters
                </div>
              )}

              {/* Over limit warning */}
              {isOverLimit && (
                <div className="text-sm text-destructive">
                  Maximum character limit exceeded ({CHAR_LIMIT} characters)
                </div>
              )}
            </div>
          )}

          {/* Image Input */}
          <ImageInput
            onImageSelect={handleImageSelect}
            disabled={isLoading}
            selectedImage={selectedImage}
          />

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full"
            size="lg"
          >
            {isLoading ? (
              <>
                <Loader2 className="size-4 animate-spin mr-2" />
                Analyzing...
              </>
            ) : (
              'Go'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
