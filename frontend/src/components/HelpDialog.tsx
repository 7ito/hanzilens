import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Segment } from './Segment';
import type { ParsedSegment } from '@/types';

interface HelpDialogProps {
  open: boolean;
  onClose: () => void;
}

// Example parsed sentence from legacy: 你有光明的未来。
const exampleSegments: ParsedSegment[] = [
  { token: '你', pinyin: 'ni3', definition: 'you' },
  { token: '有', pinyin: 'you3', definition: 'have' },
  { token: '光明', pinyin: 'guang1 ming2', definition: 'bright' },
  { token: '的', pinyin: 'de', definition: "'s (possessive)" },
  { token: '未来', pinyin: 'wei4 lai2', definition: 'future' },
  { token: '。', pinyin: '', definition: '' },
];

export function HelpDialog({ open, onClose }: HelpDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <Card className="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        {/* Close button */}
        <Button
          variant="ghost"
          size="icon"
          className="absolute top-4 right-4"
          onClick={onClose}
        >
          <X className="size-5" />
        </Button>

        {/* Content */}
        <div className="space-y-6">
          {/* Title */}
          <div className="text-center">
            <h2 className="text-2xl font-bold text-foreground">About HanziLens</h2>
          </div>

          {/* Description */}
          <div className="space-y-3 text-foreground">
            <p>
              HanziLens breaks down Chinese sentences into individual words and phrases,
              showing you the pinyin pronunciation and meaning of each segment.
            </p>
            <p>
              Click on any word to see its full dictionary entry with all possible meanings.
            </p>
          </div>

          {/* Usage */}
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-foreground">How to use</h3>
            <ol className="list-decimal list-inside space-y-1 text-foreground">
              <li>Paste or type a Chinese sentence</li>
              <li>Click <span className="font-semibold">Go</span></li>
              <li>Click on any word for more details</li>
            </ol>
          </div>

          {/* Example */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold text-foreground">Example</h3>
            
            {/* Translation */}
            <div className="text-xl text-center text-foreground">
              "You have a bright future."
            </div>

            {/* Segments */}
            <div className="flex flex-wrap justify-center items-start gap-2 py-2">
              {exampleSegments.map((segment, index) => (
                <Segment key={`${segment.token}-${index}`} segment={segment} />
              ))}
            </div>

            <p className="text-sm text-muted-foreground text-center">
              Try clicking on a word above!
            </p>
          </div>

          {/* Close button */}
          <div className="flex justify-center pt-2">
            <Button onClick={onClose} size="lg">
              Got it
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
