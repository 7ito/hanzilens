import { useState } from 'react';
import { InputView } from '@/components/InputView';
import { ResultsView } from '@/components/ResultsView';
import { useParse } from '@/hooks/useParse';
import type { ViewState } from '@/types';

export function App() {
  const [view, setView] = useState<ViewState>('input');
  const { isLoading, translation, segments, parse, reset } = useParse();

  const handleSubmit = async (sentence: string) => {
    setView('results');
    await parse(sentence);
  };

  const handleBack = () => {
    reset();
    setView('input');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {view === 'input' ? (
        <InputView onSubmit={handleSubmit} isLoading={isLoading} />
      ) : (
        <ResultsView
          translation={translation}
          segments={segments}
          isLoading={isLoading}
          onBack={handleBack}
        />
      )}
    </div>
  );
}

export default App;
