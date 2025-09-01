import { useEffect, useState } from 'react';
import { AnimatedHexagon } from './components/animated/AnimatedHexagon';
import { voiceContextManager } from './hooks/voiceContextManager';

function App() {
  const [contentLoaded, setContentLoaded] = useState(false);

  useEffect(() => {
    const loadExternalContent = async () => {
      try {
        console.log('📄 Loading infflow.md...');
        const response = await fetch('/infflow.md');
        if (response.ok) {
          const text = await response.text();
          console.log('✅ Successfully loaded external content');
          console.log('📄 Content preview:', text.substring(0, 100) + '...');
          
          // Store in voice context manager
          voiceContextManager.setStaticContext(text);
          
          // Also maintain backward compatibility
          (window as any).__externalContext = text;
          (window as any).__externalContextPriority = true;
          
          setContentLoaded(true);
        } else {
          console.error('❌ Failed to fetch infflow.md:', response.status);
          setContentLoaded(true); // Still show hexagon even if file missing
        }
      } catch (error) {
        console.error('❌ Error loading infflow.md:', error);
        setContentLoaded(true); // Still show hexagon even if error
      }
    };
    
    loadExternalContent();
    
    // Simple polling for external data (every 10 seconds)
    const pollForExternalData = async () => {
      try {
        const response = await fetch('https://hexa-worker.prabhatravib.workers.dev/api/external-data/status');
        if (response.ok) {
          const data = await response.json() as any;
          if (data.hasExternalData && data.externalData) {
            voiceContextManager.setExternalData(data.externalData);
          }
        }
      } catch (error) {
        // Silently fail - external data is optional
      }
    };
    
    // Poll every 10 seconds
    const interval = setInterval(pollForExternalData, 10000);
    
    // Cleanup on unmount
    return () => clearInterval(interval);
    
  }, []);

  // Add global function to send external data for testing
  useEffect(() => {
    (window as any).__sendExternalData = async (data: any) => {
      try {
        const response = await fetch('https://hexa-worker.prabhatravib.workers.dev/api/external-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (response.ok) {
          console.log('✅ External data sent successfully');
          // Immediately update local context
          voiceContextManager.setExternalData(data);
        }
      } catch (error) {
        console.error('❌ Failed to send external data:', error);
      }
    };
  }, []);

  // Only render hexagon after content is loaded
  if (!contentLoaded) {
    return (
      <div className="h-full w-full flex flex-col items-center justify-center">
        <div className="text-gray-500">Loading context...</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6">
        <AnimatedHexagon size={300} />
      </div>
    </div>
  );
}

export default App;