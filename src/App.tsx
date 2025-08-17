import { useAnimationSequence } from './hooks/useAnimationState';
import { AnimatedHexagon } from './components/animated/AnimatedHexagon';

function App() {
  const { greet, thinking } = useAnimationSequence();

  return (
    <div className="h-full w-full flex flex-col items-center justify-center">
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
    </div>
  );
}

export default App;