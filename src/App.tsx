import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { HexagonContainer } from './components/HexagonContainer';
import { ChatPanel } from './components/ChatPanel';
import { voiceContextManager } from './hooks/voiceContextManager';
import { useExternalDataStore } from './store/externalDataStore';
import { injectExternalDataFromStore, setGlobalExternalData, getGlobalExternalData, injectGlobalExternalData, injectExternalContext } from './lib/externalContext';
import { getIframeContext, isRunningInIframe } from './lib/iframeDetection';
import { registerToastNotification } from './lib/voiceErrorRecovery';
import { startTabVisibilityMonitoring } from './lib/voiceTabVisibilityMonitor';
import { logRedDotHidingStatus } from './lib/redDotHidingConfig';

function App() {
  // Chat panel state
  const [isChatMinimized, setIsChatMinimized] = useState(true);
  const [transcript, setTranscript] = useState<string>('');
  const [response, setResponse] = useState<string>('');
  const [sendTextHandler, setSendTextHandler] = useState<((text: string) => Promise<boolean>) | null>(null);
  const [isVoiceConnected, setIsVoiceConnected] = useState(false);

  const handleSendTextAvailable = useCallback((handler: ((text: string) => Promise<boolean>) | null) => {
    setSendTextHandler(() => handler ?? null);
  }, []);

  const handleVoiceConnectionChange = useCallback((connected: boolean) => {
    setIsVoiceConnected(connected);
  }, []);
  
  // Iframe detection and context
  const [iframeContext, setIframeContext] = useState(() => getIframeContext());

  // Enhanced mode detection based on URL path
  const [isEnhancedMode, setIsEnhancedMode] = useState(false);

  // Dynamic aspect count for enhanced mode (default 7, can be 2-10)
  const [aspectCount, setAspectCount] = useState(7);
  
  // Aspect configurations with descriptions
  const [aspectConfigs, setAspectConfigs] = useState<Array<{id: number; description: string}>>([]);

  // Callback functions for receiving data from hexagon
  const handleTranscript = (text: string) => {
    console.log('ðŸ“ App: Received transcript:', text);
    setTranscript(text);
  };

  const handleResponse = (text: string) => {
    console.log('ðŸ¤– App: Received response:', text);
    setResponse(text);
  };

  useEffect(() => {
    // Log red dot hiding feature status
    logRedDotHidingStatus();

    // Register toast notification for voice error recovery
    registerToastNotification((message, type = 'info') => {
      switch (type) {
        case 'success':
          toast.success(message);
          break;
        case 'error':
          toast.error(message);
          break;
        case 'info':
        default:
          toast.info(message);
          break;
      }
    });

    // Start tab visibility monitoring for voice connection
    startTabVisibilityMonitoring();

    // Detect if running in iframe
    const context = getIframeContext();
    setIframeContext(context);
    console.log('ðŸ” Iframe detection:', context.isIframe ? 'Running in iframe' : 'Accessed directly');

    // Check URL path for enhanced mode
    const checkEnhancedMode = () => {
      const currentPath = window.location.pathname;
      const pathSegments = currentPath.split('/').filter(Boolean);
      const enhancedModeDetected = pathSegments.includes('enhancedMode');

      console.log('🔍 URL Analysis:', {
        fullPath: currentPath,
        segments: pathSegments,
        containsEnhancedMode: enhancedModeDetected
      });

      setIsEnhancedMode(enhancedModeDetected);
      console.log('🎛️ Enhanced mode:', enhancedModeDetected ? 'ENABLED' : 'DISABLED', '(URL path contains "enhancedMode")');
    };

    checkEnhancedMode();
  }, []);

  // Watch for URL changes to update enhanced mode
  useEffect(() => {
    const handleUrlChange = () => {
      const pathSegments = window.location.pathname.split('/').filter(Boolean);
      const enhancedModeDetected = pathSegments.includes('enhancedMode');
      setIsEnhancedMode(enhancedModeDetected);
      console.log('🎛️ Enhanced mode updated:', enhancedModeDetected ? 'ENABLED' : 'DISABLED');
    };

    // Listen for popstate events (browser back/forward)
    window.addEventListener('popstate', handleUrlChange);

    return () => {
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, []);

  // PostMessage listener for dynamic aspect count from parent website
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      console.log('📨 Received PostMessage:', event.data);
      
      if (event.data.type === 'SET_ASPECT_COUNT') {
        const count = event.data.aspectCount;
        console.log('🔢 Setting aspect count to:', count);
        
        // Validate count is between 2-10
        if (count >= 2 && count <= 10) {
          setAspectCount(count);
          console.log('✅ Aspect count updated to:', count);
        } else {
          console.warn('⚠️ Invalid aspect count:', count, '- must be between 2-10');
        }
      } else if (event.data.type === 'SET_ASPECT_CONFIG') {
        const { aspectCount: count, aspects } = event.data;
        console.log('🔧 Setting aspect configuration:', { count, aspects });
        
        // Validate count is between 2-10
        if (count >= 2 && count <= 10) {
          // Validate aspects array
          if (Array.isArray(aspects) && aspects.length === count) {
            // Validate each aspect has required fields and sequential IDs
            const isValid = aspects.every((aspect: any, index: number) => 
              aspect && 
              typeof aspect.id === 'number' && 
              aspect.id === index + 1 &&
              typeof aspect.description === 'string' &&
              aspect.description.trim().length > 0
            );
            
            if (isValid) {
              setAspectCount(count);
              setAspectConfigs(aspects);
              console.log('✅ Aspect configuration updated:', aspects);
            } else {
              console.warn('⚠️ Invalid aspect configuration - aspects must have sequential IDs and non-empty descriptions');
            }
          } else {
            console.warn('⚠️ Invalid aspect configuration - aspects array length must match aspectCount');
          }
        } else {
          console.warn('⚠️ Invalid aspect count:', count, '- must be between 2-10');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    const loadExternalContent = async () => {
      try {
        console.log('ðŸ“„ Loading infflow.md...');
        const response = await fetch('/infflow.md');
        if (response.ok) {
          const text = await response.text();
          console.log('âœ… Successfully loaded external content');
          console.log('ðŸ“„ Content preview:', text.substring(0, 100) + '...');

          // Store in voice context manager
          voiceContextManager.setStaticContext(text);

          // Also maintain backward compatibility
          (window as any).__externalContext = text;
          (window as any).__externalContextPriority = true;
        } else {
          console.error('âŒ Failed to fetch infflow.md:', response.status);
        }
      } catch (error) {
        console.error('âŒ Error loading infflow.md:', error);
      }

      // Load external data using iframe session ID
      const loadExternalData = async () => {
        try {
          // Extract sessionId from URL parameters
          const urlParams = new URLSearchParams(window.location.search);
          const iframeSessionId = urlParams.get('sessionId');

          if (iframeSessionId) {
            console.log('ðŸ†” Found iframe session ID:', iframeSessionId);

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
              console.log('ðŸ“Š External data status:', statusData);

              if (statusData.hasExternalData && statusData.externalData) {
                console.log('âœ… Found external data for iframe session:', statusData.externalData);

                // Store the external data in the Zustand store
                useExternalDataStore.getState().setExternalData({
                  ...statusData.externalData,
                  source: 'iframe_session'
                });

                console.log('ðŸ“ External data loaded into store for voice context');
              } else {
                console.log('â„¹ï¸ No external data found for iframe session');
              }
            } else {
              console.error('âŒ Failed to check external data status:', statusResponse.status);
            }
          } else {
            console.log('â„¹ï¸ No iframe session ID found in URL');
          }
        } catch (error) {
          console.error('âŒ Error loading external data:', error);
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
      console.log('ðŸ“Š Current external data in Zustand store:', store.currentData);
      return store.currentData;
    };
    
    (window as any).__injectFromStore = () => {
      console.log('ðŸ”§ Manually injecting external data from store...');
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
      console.log('ðŸ§ª Testing injection...');
      const globalData = getGlobalExternalData();
      console.log('ðŸŒ Global data:', globalData);
      if (globalData) {
        await injectGlobalExternalData();
      } else {
        console.log('âŒ No global data to inject');
      }
    };
    
    // Add a function to manually inject external data
    (window as any).__injectExternalData = async (text: string) => {
      console.log('ðŸ”§ Manually injecting external data:', text);
      setGlobalExternalData(text);
      await injectGlobalExternalData();
    };
    
    // Add a function to test injection directly
    (window as any).__testInjection = async (text: string) => {
      console.log('ðŸ§ª Testing direct injection:', text);
      await injectExternalContext(text);
    };
    
    (window as any).__clearExternalData = () => {
      console.log('ðŸ—‘ï¸ Clearing external data from store...');
      useExternalDataStore.getState().clearExternalData();
    };
    
    (window as any).__reconnectVoiceAgent = () => {
      console.log('ðŸ”„ Reconnecting voice agent to get latest Zustand data...');
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
        console.log('âœ… Forced authoritative injection complete');
      } else {
        console.log('âŒ No external data available to inject');
      }
    };
    
    // Add iframe detection debugging
    (window as any).__checkIframeStatus = () => {
      const isIframe = isRunningInIframe();
      console.log('ðŸ” Current iframe status:', isIframe ? 'In iframe' : 'Direct access');
      console.log('ðŸ” Chat panel should be:', isIframe ? 'HIDDEN' : 'VISIBLE');
      return isIframe;
    };
  }, []);


  // Determine layout mode
  const shouldShowChat = !iframeContext.isIframe || iframeContext.showChat;
  const isVerticalSplit = iframeContext.isIframe && iframeContext.showChat;
  const isChatOnly = iframeContext.chatOnly; // NEW: Add chat-only mode detection

  if (isChatOnly) {
    // Chat-only layout - show only the chat panel
    return (
      <div className="h-full w-full">
        <ChatPanel
          transcript={transcript}
          response={response}
          isMinimized={false}
          onToggleMinimize={undefined}
          onSendMessage={sendTextHandler ?? undefined}
          isAgentReady={isVoiceConnected}
          enhancedMode={isEnhancedMode}
          aspectCount={aspectCount}
          aspectConfigs={aspectConfigs}
          isEmbedded={true}
        />
      </div>
    );
  }

  if (isVerticalSplit) {
    // Vertical split layout for iframe with chat
      return (
        <div className="h-full w-full flex flex-col">
          {/* Top Section - Hexagon (FIXED 50% height) */}
          <div className="h-1/2 min-h-0 flex-shrink-0 flex items-center justify-center overflow-hidden">
            <HexagonContainer 
              size={300} 
              onTranscript={handleTranscript}
              onResponse={handleResponse}
              onSendTextAvailable={handleSendTextAvailable}
              onConnectionChange={handleVoiceConnectionChange}
            />
          </div>
          
          {/* Bottom Section - Chat Panel (FIXED 50% height) */}
          <div className="h-1/2 min-h-0 flex-shrink-0 border-t border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">
            <ChatPanel
              transcript={transcript}
              response={response}
              isMinimized={false}
              onToggleMinimize={undefined}
              onSendMessage={sendTextHandler ?? undefined}
              isAgentReady={isVoiceConnected}
              enhancedMode={isEnhancedMode}
              aspectCount={aspectCount}
              aspectConfigs={aspectConfigs}
              isEmbedded={true}
            />
          </div>
        </div>
      );
  }

  // Default layout (centered with floating chat)
  return (
    <div className="h-full w-full flex flex-col items-center justify-center">
      <div className="flex flex-col items-center gap-6 -mt-32">
        <HexagonContainer 
          size={300} 
          onTranscript={handleTranscript}
          onResponse={handleResponse}
          onSendTextAvailable={handleSendTextAvailable}
          onConnectionChange={handleVoiceConnectionChange}
        />
      </div>
      
      {/* Chat Panel - only show when NOT in iframe */}
      {shouldShowChat && (
        <ChatPanel
          transcript={transcript}
          response={response}
          isMinimized={isChatMinimized}
          onToggleMinimize={() => setIsChatMinimized(!isChatMinimized)}
          onSendMessage={sendTextHandler ?? undefined}
          isAgentReady={isVoiceConnected}
          enhancedMode={isEnhancedMode}
          aspectCount={aspectCount}
          aspectConfigs={aspectConfigs}
          isEmbedded={false}
        />
      )}
    </div>
  );
}

export default App;
