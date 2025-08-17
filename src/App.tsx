import { AnimatedHexagon } from './components/animated/AnimatedHexagon';

function App() {
  return (
    <div className="h-full w-full flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <AnimatedHexagon size={300} />
      </div>
    </div>
  );
}

export default App;