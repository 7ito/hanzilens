import { useState, useEffect, useRef } from 'react';
import { InputView } from '@/components/InputView';
import { ResultsView } from '@/components/ResultsView';
import { ImageResultsView } from '@/components/ImageResultsView';
import { HelpDialog } from '@/components/HelpDialog';
import { useParse } from '@/hooks/useParse';
import { useImageParse } from '@/hooks/useImageParse';
import { useAnalytics, AnalyticsEvents } from '@/hooks/useAnalytics';
import type { ViewState, ParseInput } from '@/types';

const HAS_VISITED_KEY = 'hanzilens-has-visited';

export function App() {
  const [view, setView] = useState<ViewState>('input');
  const [showHelp, setShowHelp] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const { isLoading, translation, translationParts, segments, parse, reset } = useParse();
  const imageParse = useImageParse();
  const { trackEvent, trackPageView } = useAnalytics();
  const hasTrackedInitialView = useRef(false);

  // Track initial page view on mount
  useEffect(() => {
    if (!hasTrackedInitialView.current) {
      trackPageView('input');
      hasTrackedInitialView.current = true;
    }
  }, [trackPageView]);

  // Show help dialog on first visit and track first_visit event
  useEffect(() => {
    const hasVisited = localStorage.getItem(HAS_VISITED_KEY);
    if (!hasVisited) {
      setShowHelp(true);
      localStorage.setItem(HAS_VISITED_KEY, 'true');
      trackEvent(AnalyticsEvents.FIRST_VISIT);
    }
  }, [trackEvent]);

  const handleSubmit = async (input: ParseInput) => {
    if (input.type === 'image') {
      setImageDataUrl(input.image);
      setView('image-results');
      trackPageView('image-results');
      await imageParse.start(input.image);
      return;
    }

    setView('results');
    trackPageView('results');
    await parse(input);
  };

  const handleBack = () => {
    reset();
    imageParse.reset();
    setImageDataUrl(null);
    setView('input');
    trackPageView('input');
  };

  const handleHelpClick = () => {
    setShowHelp(true);
    trackEvent(AnalyticsEvents.HELP_OPENED);
  };

  const handleHelpClose = () => {
    setShowHelp(false);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {view === 'input' ? (
        <InputView
          onSubmit={handleSubmit}
          isLoading={isLoading}
          onHelpClick={handleHelpClick}
        />
      ) : view === 'results' ? (
        <ResultsView
          translation={translation}
          translationParts={translationParts}
          segments={segments}
          isLoading={isLoading}
          onBack={handleBack}
          onHelpClick={handleHelpClick}
        />
      ) : (
        imageDataUrl && (
          <ImageResultsView
            imageDataUrl={imageDataUrl}
            isLoadingOcr={imageParse.isLoadingOcr}
            ocrError={imageParse.ocrError}
            ocrResult={imageParse.ocrResult}
            sentences={imageParse.sentences}
            sentenceResults={imageParse.sentenceResults}
            sentenceLoading={imageParse.sentenceLoading}
            sentenceError={imageParse.sentenceError}
            openSentenceIds={imageParse.openSentenceIds}
            onBack={handleBack}
            onHelpClick={handleHelpClick}
            onSelectSentence={imageParse.selectSentence}
            onRetryOcr={() => imageParse.start(imageDataUrl)}
          />
        )
      )}

      <HelpDialog open={showHelp} onClose={handleHelpClose} />
    </div>
  );
}

export default App;
