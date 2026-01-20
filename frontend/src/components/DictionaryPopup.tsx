import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Draggable from 'react-draggable';
import { X, BookText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DictionaryView } from './DictionaryView';
import { lookupDefinition } from '@/lib/api';
import { getNextZIndex } from '@/lib/zIndex';
import type { LookupResponse } from '@/types';

interface DictionaryPopupProps {
  token: string;
  onClose: () => void;
  initialPosition: { x: number; y: number };
}

export function DictionaryPopup({ token, onClose, initialPosition }: DictionaryPopupProps) {
  const [data, setData] = useState<LookupResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zIndex, setZIndex] = useState(() => getNextZIndex());
  const nodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const result = await lookupDefinition(token);
        if (!cancelled) {
          setData(result);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchData();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Bring popup to front when clicked/touched
  const bringToFront = () => {
    setZIndex(getNextZIndex());
  };

  const popup = (
    <Draggable 
      handle=".drag-handle" 
      bounds="body" 
      nodeRef={nodeRef}
      onStart={bringToFront}
      defaultPosition={initialPosition}
    >
      <div
        ref={nodeRef}
        className="fixed top-0 left-0"
        style={{ zIndex }}
        onMouseDown={bringToFront}
      >
        <Card 
          className="w-[300px] md:w-[400px] shadow-xl border-2 border-accent/30"
          onMouseDown={bringToFront}
        >
          {/* Draggable header */}
          <CardHeader className="drag-handle cursor-move py-2 px-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-medium">{token}</CardTitle>
              <div className="flex items-center gap-1">
                {/* MDBG Link */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  asChild
                >
                  <a
                    href={`https://www.mdbg.net/chinese/dictionary?wdqb=${encodeURIComponent(token)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View on MDBG"
                  >
                    <BookText className="size-3.5" />
                  </a>
                </Button>
                {/* Close button */}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={onClose}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-3 max-h-[300px] overflow-y-auto">
            <DictionaryView data={data} loading={loading} error={error} />
          </CardContent>
        </Card>
      </div>
    </Draggable>
  );

  return createPortal(popup, document.body);
}
