import { useState, useEffect } from 'react';
import { InputView } from '@/components/InputView';
import { ResultsView } from '@/components/ResultsView';
import { HelpDialog } from '@/components/HelpDialog';
import { useParse } from '@/hooks/useParse';
import type { ViewState, ParseInput } from '@/types';

const HAS_VISITED_KEY = 'hanzilens-has-visited';

export function App() {
  const [view, setView] = useState<ViewState>('input');
  const [showHelp, setShowHelp] = useState(false);
  const { isLoading, translation, translationParts, segments, parse, reset } = useParse();

  // Show help dialog on first visit
  useEffect(() => {
    const hasVisited = localStorage.getItem(HAS_VISITED_KEY);
    if (!hasVisited) {
      setShowHelp(true);
      localStorage.setItem(HAS_VISITED_KEY, 'true');
    }
  }, []);

  const handleSubmit = async (input: ParseInput) => {
    setView('results');
    await parse(input);
  };

  const handleBack = () => {
    reset();
    setView('input');
  };

  const handleHelpClick = () => {
    setShowHelp(true);
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
      ) : (
        <ResultsView
          translation={translation}
          translationParts={translationParts}
          segments={segments}
          isLoading={isLoading}
          onBack={handleBack}
          onHelpClick={handleHelpClick}
        />
      )}

      <HelpDialog open={showHelp} onClose={handleHelpClose} />
    </div>
  );
}

export default App;
