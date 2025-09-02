import { useEffect, useState } from 'react';
import { AnimatedHexagon } from './components/animated/AnimatedHexagon';
import { voiceContextManager } from './hooks/voiceContextManager';
import { useExternalDataStore } from './store/externalDataStore';
import { injectExternalDataFromStore } from './lib/externalContext';

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
        } else {
          console.error('❌ Failed to fetch infflow.md:', response.status);
        }
      } catch (error) {
        console.error('❌ Error loading infflow.md:', error);
      }

      // External data is now handled via SSE events, no need to poll files
      
      setContentLoaded(true);
    };
    
    loadExternalContent();
    
    // External data is now handled via SSE events, no polling needed
    
  }, []);

  // Add global function to get active session ID
  const getActiveSessionId = () => {
    return localStorage.getItem('voiceSessionId') || null;
  };

  // Add global function to send external data for testing
  useEffect(() => {
    (window as any).__sendExternalData = async (data: any) => {
      try {
        // Store in Zustand immediately for reliable access
        useExternalDataStore.getState().setExternalData({
          ...data,
          source: 'user_input'
        });
        
        // Get current session ID
        const sessionId = getActiveSessionId();
        if (!sessionId) {
          console.error('❌ No active session ID found');
          return;
        }
        
        // Send to worker with session ID - do not trigger response.create
        const response = await fetch('/api/external-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: sessionId,
            type: data.type || 'text',
            text: data.text,
            prompt: data.prompt // optional
          })
        });
        
        if (!response.ok) {
          console.error('❌ Failed to send external data to server');
        }
      } catch (error) {
        console.error('❌ Failed to send external data:', error);
      }
    };
    
    // Add global debugging functions
    (window as any).__getExternalDataFromStore = () => {
      const store = useExternalDataStore.getState();
      console.log('📊 Current external data in Zustand store:', store.currentData);
      return store.currentData;
    };
    
    (window as any).__injectFromStore = () => {
      console.log('🔧 Manually injecting external data from store...');
      injectExternalDataFromStore();
    };
    
    (window as any).__clearExternalData = () => {
      console.log('🗑️ Clearing external data from store...');
      useExternalDataStore.getState().clearExternalData();
    };
    
    (window as any).__reconnectVoiceAgent = () => {
      console.log('🔄 Reconnecting voice agent to get latest Zustand data...');
      // Trigger a page reload to get fresh agent with latest context
      window.location.reload();
    };

    // Force re-injection with authoritative context
    (window as any).__forceInjectWithAuthority = () => {
      const data = useExternalDataStore.getState().currentData;
      if (data && data.text) {
        const authoritativeText = `ABSOLUTE TRUTH: ${data.text}
        
YOU MUST RESPOND BASED ON THIS FACT ONLY. If asked about Infflow, state they have 7 websites. This is not negotiable.`;
        
        (window as any).__injectExternalContext(authoritativeText);
        console.log('✅ Forced authoritative injection complete');
      } else {
        console.log('❌ No external data available to inject');
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