import { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { hasChineseText } from '@/lib/api';
import { Loader2 } from 'lucide-react';

const CHAR_LIMIT = 150;
const MIN_CHINESE_RATIO = 0.25;

interface InputViewProps {
  onSubmit: (sentence: string) => void;
  isLoading: boolean;
}

export function InputView({ onSubmit, isLoading }: InputViewProps) {
  const [text, setText] = useState('');
  const [isValid, setIsValid] = useState(false);

  const charCount = text.length;
  const isOverLimit = charCount > CHAR_LIMIT;

  useEffect(() => {
    setIsValid(hasChineseText(text, MIN_CHINESE_RATIO) && !isOverLimit);
  }, [text, isOverLimit]);

  const handleSubmit = () => {
    if (isValid && !isLoading) {
      onSubmit(text.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
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
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste or type a Chinese sentence here..."
            className="min-h-[150px] text-lg resize-none"
            disabled={isLoading}
          />

          {/* Validation Messages */}
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

          {/* Submit Button */}
          <Button
            onClick={handleSubmit}
            disabled={!isValid || isLoading}
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
