import { useEffect, useState } from 'react';
import { AnimatedHexagon } from './components/animated/AnimatedHexagon';
import { voiceContextManager } from './hooks/voiceContextManager';

// Simple hash function to detect file changes
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString();
};

function App() {
  const [contentLoaded, setContentLoaded] = useState(false);
  const [lastExternalDataHash, setLastExternalDataHash] = useState<string>('');

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
        } else {
          console.error('❌ Failed to fetch infflow.md:', response.status);
        }
      } catch (error) {
        console.error('❌ Error loading infflow.md:', error);
      }

      // Also load external data file (like infflow.md)
      try {
        console.log('📄 Loading external-data.md...');
        const externalResponse = await fetch('/external-data.md');
        if (externalResponse.ok) {
          const externalText = await externalResponse.text();
          
          // Set initial hash
          setLastExternalDataHash(simpleHash(externalText));
          
          // Check if it's not the default "No external data available" message
          if (!externalText.includes('No external data available')) {
            console.log('✅ Successfully loaded external data');
            console.log('📄 External data preview:', externalText.substring(0, 100) + '...');
            
            // Store in voice context manager as external data
            voiceContextManager.setExternalData({
              text: externalText,
              type: 'markdown',
              prompt: 'External data from file'
            });
          } else {
            console.log('ℹ️ External data file is empty - no context update needed');
          }
        } else {
          console.log('ℹ️ No external data file available yet');
        }
      } catch (error) {
        console.log('ℹ️ External data file not available:', error);
      }
      
      setContentLoaded(true);
    };
    
    loadExternalContent();
    
    // Smart polling for external data (every 5 seconds)
    const pollForExternalData = async () => {
      try {
        // Fetch external data file directly (like infflow.md)
        const response = await fetch('/external-data.md');
        if (response.ok) {
          const externalText = await response.text();
          
          // Calculate hash to detect changes
          const currentHash = simpleHash(externalText);
          
          // Only update if file has changed
          if (currentHash !== lastExternalDataHash) {
            setLastExternalDataHash(currentHash);
            
            // Check if it's not the default "No external data available" message
            if (!externalText.includes('No external data available')) {
              console.log('🔄 External data file changed - updating voice context');
              console.log('📥 External data file updated:', externalText.substring(0, 100) + '...');
              
              voiceContextManager.setExternalData({
                text: externalText,
                type: 'markdown',
                prompt: 'External data from file'
              });
              
              console.log('✅ Voice context manager updated with external data file');
            } else {
              console.log('📄 External data file is empty - no context update needed');
            }
          }
        }
      } catch (error) {
        // Silently fail - external data is optional
      }
    };
    
    // Initial poll
    pollForExternalData();
    
    // Poll every 5 seconds (more frequent than 10)
    const interval = setInterval(pollForExternalData, 5000);
    
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
          body: JSON.stringify(data)  // No need to include session ID
        });
        if (response.ok) {
          console.log('✅ External data sent successfully');
          // The external data will now be available via the external-data.md file
          // which will be picked up by the polling mechanism
          console.log('✅ External data will be available via external-data.md file');
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