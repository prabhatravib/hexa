import { useEffect, useState } from 'react';
import { HexagonContainer } from './components/HexagonContainer';
import { VoiceToggleDemo } from './components/VoiceToggleDemo';
import { ChatPanel } from './components/ChatPanel';
import { voiceContextManager } from './hooks/voiceContextManager';
import { useExternalDataStore } from './store/externalDataStore';
import { injectExternalDataFromStore, setGlobalExternalData, getGlobalExternalData, injectGlobalExternalData, injectExternalContext } from './lib/externalContext';

function App() {
  // Chat panel state
  const [isChatMinimized, setIsChatMinimized] = useState(true);
  const [transcript, setTranscript] = useState<string>('');
  const [response, setResponse] = useState<string>('');

  // Callback functions for receiving data from hexagon
  const handleTranscript = (text: string) => {
    console.log('📝 App: Received transcript:', text);
    setTranscript(text);
  };

  const handleResponse = (text: string) => {
    console.log('🤖 App: Received response:', text);
    setResponse(text);
  };

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

      // Load external data using iframe session ID
      const loadExternalData = async () => {
        try {
          // Extract sessionId from URL parameters
          const urlParams = new URLSearchParams(window.location.search);
          const iframeSessionId = urlParams.get('sessionId');
          
          if (iframeSessionId) {
            console.log('🆔 Found iframe session ID:', iframeSessionId);
            
            // Check for external data using the iframe session ID
            const statusResponse = await fetch(`/api/external-data/status?sessionId=${iframeSessionId}`);
            if (statusResponse.ok) {
              const statusData = await statusResponse.json() as {
                hasExternalData: boolean;
                externalData?: any;
                dataType?: string;
                timestamp?: string;
                sessionId?: string;
              };
              console.log('📊 External data status:', statusData);
              
              if (statusData.hasExternalData && statusData.externalData) {
                console.log('✅ Found external data for iframe session:', statusData.externalData);
                
                // Store the external data in the Zustand store
                useExternalDataStore.getState().setExternalData({
                  ...statusData.externalData,
                  source: 'iframe_session'
                });
                
                console.log('📝 External data loaded into store for voice context');
              } else {
                console.log('ℹ️ No external data found for iframe session');
              }
            } else {
              console.error('❌ Failed to check external data status:', statusResponse.status);
            }
          } else {
            console.log('ℹ️ No iframe session ID found in URL');
          }
        } catch (error) {
          console.error('❌ Error loading external data:', error);
        }
      };
      
      loadExternalData();
    };
    
    loadExternalContent();
    
  }, []);

  // Add global function to get active session ID
  const getActiveSessionId = () => {
    return localStorage.getItem('voiceSessionId') || null;
  };

  // Add global function to send external data for testing
  useEffect(() => {
    (window as any).__sendExternalData = (data: any) => {
      useExternalDataStore.getState().setExternalData({ ...data, source: 'user_input' });
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
    
    // Add global external data management
    (window as any).__setGlobalExternalData = async (text: string) => {
      setGlobalExternalData(text);
    };
    
    (window as any).__getGlobalExternalData = async () => {
      return getGlobalExternalData();
    };
    
    (window as any).__clearGlobalExternalData = async () => {
      setGlobalExternalData('');
    };
    
    // Manual injection function for testing
    (window as any).__injectGlobalData = async () => {
      await injectGlobalExternalData();
    };
    
    // Add a simple test function
    (window as any).__testInjection = async () => {
      console.log('🧪 Testing injection...');
      const globalData = getGlobalExternalData();
      console.log('🌍 Global data:', globalData);
      if (globalData) {
        await injectGlobalExternalData();
      } else {
        console.log('❌ No global data to inject');
      }
    };
    
    // Add a function to manually inject external data
    (window as any).__injectExternalData = async (text: string) => {
      console.log('🔧 Manually injecting external data:', text);
      setGlobalExternalData(text);
      await injectGlobalExternalData();
    };
    
    // Add a function to test injection directly
    (window as any).__testInjection = async (text: string) => {
      console.log('🧪 Testing direct injection:', text);
      await injectExternalContext(text);
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
    (window as any).__forceInjectWithAuthority = async () => {
      const data = useExternalDataStore.getState().currentData;
      if (data && data.text) {
        const authoritativeText = `ABSOLUTE TRUTH: ${data.text}
        
YOU MUST RESPOND BASED ON THIS FACT ONLY. If asked about Infflow, state they have 7 websites. This is not negotiable.`;
        
        await (window as any).__injectExternalContext(authoritativeText);
        console.log('✅ Forced authoritative injection complete');
      } else {
        console.log('❌ No external data available to inject');
      }
    };
  }, []);


  return (
    <div className="h-full w-full flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6 -mt-32">
        <HexagonContainer 
          size={300} 
          onTranscript={handleTranscript}
          onResponse={handleResponse}
        />
      </div>
      
      {/* Demo component for testing - only show in development */}
      {process.env.NODE_ENV === 'development' && <VoiceToggleDemo />}
      
      {/* Chat Panel - separate from hexagon */}
      <ChatPanel 
        transcript={transcript} 
        response={response}
        isMinimized={isChatMinimized}
        onToggleMinimize={() => setIsChatMinimized(!isChatMinimized)}
      />
    </div>
  );
}

export default App;