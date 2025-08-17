import React from 'react';
import { useAnimationSequence } from './hooks/useAnimationState';
import { AnimatedHexagon } from './components/animated/AnimatedHexagon';
import { useVoiceInteraction } from './hooks/useVoiceInteraction';

function App() {
  const { greet, thinking } = useAnimationSequence();
  const { testVoiceConnection, isConnected, connect } = useVoiceInteraction();

  // Auto-connect to voice service when app starts
  React.useEffect(() => {
    console.log('🚀 App starting, attempting to connect to voice service...');
    connect();
  }, [connect]);

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
          <button 
            onClick={testVoiceConnection}
            className={`px-4 py-2 rounded-lg transition-colors ${
              isConnected 
                ? 'bg-green-600 text-white hover:bg-green-700' 
                : 'bg-red-500 text-white hover:bg-red-600'
            }`}
          >
            {isConnected ? 'Voice Connected' : 'Test Voice'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;