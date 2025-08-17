import { useMemo } from 'react';
import { Container, Theme } from './settings/types';
import { HexagonIcon } from './components/generated/HexagonIcon';
import { AnimatedHexagon } from './components/animated/AnimatedHexagon';
import { useAnimationSequence } from './hooks/useAnimationState';

let theme: Theme = 'light';
// only use 'centered' container for standalone components, never for full page apps or websites.
let container: Container = 'centered';

function App() {
  const { greet, thinking } = useAnimationSequence();
  
  function setTheme(theme: Theme) {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }

  setTheme(theme);

  const generatedComponent = useMemo(() => {
    // THIS IS WHERE THE TOP LEVEL GENRATED COMPONENT WILL BE RETURNED!
    return (
      <div className="flex flex-col items-center gap-6">
        <AnimatedHexagon size={300} />
        <div className="flex gap-4">
          <button 
            onClick={greet}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors"
          >
            Greet
          </button>
          <button 
            onClick={thinking}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Thinking
          </button>
        </div>
      </div>
    );
  }, [greet, thinking]);

  if (container === 'centered') {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center">
        {generatedComponent}
      </div>
    );
  } else {
    return (
      <>
        {generatedComponent}
      </>
    );
  }
}

export default App;