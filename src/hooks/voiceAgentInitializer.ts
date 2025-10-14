import { getLanguageInstructions } from '@/lib/languageConfig';
import { getBaseHexaInstructions } from '@/lib/agentInstructions';
import { setupSessionEventHandlers } from './voiceSessionEvents';
import { initializeWebRTCConnection } from './voiceWebRTCConnection';
import { voiceContextManager } from './voiceContextManager';
import { setActiveSession, clearActiveSession, injectExternalContext, injectExternalDataFromStore, setBaseInstructions } from '@/lib/externalContext';
import { useExternalDataStore } from '@/store/externalDataStore';
import { useAnimationStore, VoiceState } from '@/store/animationStore';
import { getSessionSend } from '@/lib/voiceSessionUtils';



interface VoiceAgentInitializerOptions {
  setVoiceState: (state: VoiceState) => void;
  onError?: (error: string) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
}

// Export the injectExternalContext function for use by SSE handlers
export { injectExternalContext };

// Mutex to prevent duplicate initialization
let __realtimeInitInFlight = false;
let __realtimeRecoveryInFlight = false;

export const initializeOpenAIAgentOnce = async (
  sessionData: any,
  options: VoiceAgentInitializerOptions
) => {
  if (__realtimeInitInFlight) {
    console.log('⏳ Realtime init already in flight; ignoring duplicate call');
    return null;
  }
  
  __realtimeInitInFlight = true;
  // Expose mutex globally for cross-module checks
  (window as any).__realtimeInitInFlight = true;
  
  try {
    return await initializeOpenAIAgent(sessionData, options);
  } finally {
    __realtimeInitInFlight = false;
    (window as any).__realtimeInitInFlight = false;
  }
};

export const initializeOpenAIAgent = async (
  sessionData: any,
  options: VoiceAgentInitializerOptions
) => {
  const { setVoiceState, onError, startSpeaking, stopSpeaking, setSpeechIntensity, audioContextRef } = options;
  
  // Check if voice is disabled before initializing
  try {
    // Check global flag first (set by AnimatedHexagon)
    if ((window as any).__voiceSystemBlocked) {
      console.log('🔇 Voice system blocked globally - blocking OpenAI Agent initialization');
      return false; // Don't initialize
    }
    
    const disabled = useAnimationStore.getState().isVoiceDisabled;
    if (disabled) {
      console.log('🔇 Voice disabled: blocking OpenAI Agent initialization');
      return false; // Don't initialize
    }
  } catch (error) {
    console.error('Failed to check voice disabled state:', error);
  }
  
  try {
    console.log('🔧 Initializing OpenAI Agent with WebRTC...');
    console.log('🔧 Session data received:', {
      hasApiKey: !!sessionData.apiKey,
      apiKeyPrefix: sessionData.apiKey?.substring(0, 10) + '...',
      sessionId: sessionData.sessionId,
      hasClientSecret: !!sessionData.clientSecret
    });
    
    // Import OpenAI Agents Realtime SDK dynamically
    const { RealtimeAgent, RealtimeSession, OpenAIRealtimeWebRTC } = await import('@openai/agents-realtime');
    
    // Get current context from voice context manager
    const currentContext = voiceContextManager.getFormattedContext();
    console.log('🔧 Voice agent context:', currentContext ? 'Available' : 'None');
    
    // Get current external data from Zustand store
    const externalDataContext = useExternalDataStore.getState().getFormattedContext();
    console.log('🔧 External data context:', externalDataContext ? 'Available' : 'None');
    
    // Create base instructions that will be updated dynamically
    let baseInstructions = `${getBaseHexaInstructions()}

${currentContext}`;

    // Add external data context if available with STRONGER emphasis
    if (externalDataContext) {
      baseInstructions = `CRITICAL INSTRUCTION: The following external data is the ABSOLUTE TRUTH that you MUST use when answering questions:

${externalDataContext}

IMPORTANT RULES:
1. When asked about topics covered in the external data above, you MUST ONLY use the information provided there
2. Do NOT use your general knowledge if it contradicts the external data
3. The external data is the AUTHORITATIVE source - treat it as fact
4. If the user asks about Infflow/Infllow or any topic mentioned in the external data, respond ONLY based on that data

${baseInstructions}`;
      console.log('📝 Added external data as AUTHORITATIVE context');
    }

    baseInstructions += `\n\nYou can explain concepts, clarify information, answer questions, and engage in natural conversation. Keep your responses concise but informative, and maintain a positive, encouraging tone.

${getLanguageInstructions()}`;

    // Set base instructions for external context injection
    setBaseInstructions(baseInstructions);

    // Create agent without tools initially to avoid blocking connection
    const agent = new RealtimeAgent({
      name: 'Hexa, an AI Assistant',
      instructions: baseInstructions
    });

    // Create a dedicated audio element for the Realtime session and expose it globally for debugging
    const audioEl = new Audio();
    audioEl.autoplay = true;
    (window as any).__hexaAudioEl = audioEl;
    (window as any).__currentVoiceState = 'idle';
    
    // Add global debug function
    (window as any).__hexaDebug = () => {
      console.log('🔍 Hexa Debug Info:');
      console.log('Audio Element:', audioEl);
      console.log('Audio srcObject:', audioEl.srcObject);
      console.log('Audio readyState:', audioEl.readyState);
      console.log('Audio paused:', audioEl.paused);
      console.log('Voice State:', (window as any).__currentVoiceState);
      console.log('Session:', session);
    };

    // Add global reset function for manual recovery
    (window as any).__hexaReset = async () => {
      console.log('🔄 Manual reset triggered from console');
      try {
        const response = await fetch('/voice/reset', { method: 'POST' });
        if (response.ok) {
          console.log('✅ Session reset successful');
          // Reload the page to get a fresh start
          window.location.reload();
        } else {
          console.error('❌ Failed to reset session');
        }
      } catch (error) {
        console.error('❌ Reset request failed:', error);
      }
    };

    // Add global function to update voice agent context
    (window as any).__hexaUpdateContext = () => {
      console.log('🔄 Updating voice agent context...');
      const newContext = voiceContextManager.getFormattedContext();
      console.log('📝 New context:', newContext ? 'Available' : 'None');
      
      // Note: The context is now dynamically loaded when the agent is created
      // For real-time updates, we would need to recreate the agent or use a different approach
      console.log('ℹ️ Context will be applied on next agent initialization');
    };

    // Add global function to view current context
    (window as any).__hexaViewContext = () => {
      const context = voiceContextManager.getFormattedContext();
      console.log('📋 Current voice context:', context);
      return context;
    };

    // Add global function to get latest external data from Zustand
    (window as any).__hexaGetExternalData = () => {
      const externalData = useExternalDataStore.getState().getFormattedContext();
      console.log('📊 Latest external data from Zustand:', externalData);
      return externalData;
    };

    // Monitor audio element state
    audioEl.addEventListener('loadeddata', () => {
      console.log('🎵 Audio element loaded data');
      console.log('Audio element state:', {
        srcObject: audioEl.srcObject,
        readyState: audioEl.readyState,
        paused: audioEl.paused,
        duration: audioEl.duration
      });
    });
    
    // Monitor all audio element events for debugging
    ['loadstart', 'durationchange', 'loadedmetadata', 'canplay', 'canplaythrough', 'play', 'playing', 'pause', 'ended', 'error'].forEach(eventName => {
      audioEl.addEventListener(eventName, (e) => {
        console.log(`🎵 Audio event: ${eventName}`, {
          srcObject: audioEl.srcObject,
          readyState: audioEl.readyState,
          paused: audioEl.paused,
          currentTime: audioEl.currentTime,
          duration: audioEl.duration
        });
      });
    });
    
    // Create a WebRTC transport that allows ephemeral client secrets issued by our worker
    const transport = new OpenAIRealtimeWebRTC({
      useInsecureApiKey: true,
      audioElement: audioEl
    });

    // Create session and connect using the shared transport
    const session = new RealtimeSession(agent, {
      transport
    });
    (session as any).__hexaSessionId = sessionData?.sessionId ?? null;

    // Add debug updater for session instructions
    (window as any).__updateSessionInstructions = async (instructions: string) => {
      const s: any = session;
      if (s?.state !== 'open') return false;

      const send = getSessionSend(s);
      if (!send) return false;

      try {
        // Attach ACK listener before sending
        const ackPromise = new Promise((resolve) => {
          const timeout = setTimeout(() => {
            cleanup();
            resolve(false);
          }, 3000);

          const onEvent = (ev: any) => {
            if (ev?.type === 'session.updated') {
              cleanup();
              resolve(true);
            }
          };

          const cleanup = () => {
            clearTimeout(timeout);
            s.off?.('event', onEvent);
            s.off?.('session.updated', onEvent);
          };

          s.on?.('event', onEvent);
          s.on?.('session.updated', onEvent);
        });

        // Send session.update
        await Promise.resolve(send({ type: 'session.update', session: { instructions } }));

        return await ackPromise;
      } catch {
        return false;
      }
    };

    // Set base instructions in the worker for session-level updates
    try {
      await fetch('/api/set-base-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionData.sessionId,
          instructions: baseInstructions
        })
      });
    } catch (error) {
      console.error('❌ Failed to set base instructions:', error);
    }

    // External data is now handled via Zustand subscription to /api/external-data
    
    // Debug: Log all session events to understand what's available (excluding transport events)
    const originalEmit = (session as any).emit;
    if (originalEmit) {
      (session as any).emit = function(event: string, ...args: any[]) {
        // Filter out repetitive transport events to reduce console noise
        if (event !== 'transport_event') {
          console.log(`🔍 Session event: ${event}`, args);
        }
        return originalEmit.call(this, event, ...args);
      };
    }
    
    // Set up session event handlers
    setupSessionEventHandlers(session, {
      setVoiceState,
      startSpeaking,
      stopSpeaking,
      audioEl,
      audioContextRef,
      setSpeechIntensity,
    });
    
    // Subscribe to Zustand changes and automatically update session instructions

    const formatExternalData = (data: any) => {
      if (!data) return '';
      
      if (data.type === "mermaid") {
        return `External context (Mermaid diagram available):\n\`\`\`mermaid\n${data.text}\n\`\`\``;
      } else {
        return `External context:\n${data.text}`;
      }
    };

    // External data is now handled via the new useEffect in useVoiceInteraction
    const unsubscribe = useExternalDataStore.subscribe(() => {
      // No longer posting directly - handled by the new guarded approach
    });
    

    
    // External data injection is now handled via Zustand subscription
    
    // Clear active session ONLY when explicitly disconnected
    // Do NOT clear on error events - this allows the WebRTC session to survive transient errors
    (session as any).on('disconnected', () => {
      console.log('🔗 Session disconnected, clearing active session');
      clearActiveSession();
      unsubscribe(); // Clean up Zustand subscription
    });
    
    const ok = await initializeWebRTCConnection(session, sessionData, {
      audioEl, setVoiceState, startSpeaking, stopSpeaking, setSpeechIntensity, audioContextRef
    });

    if (ok) {
      setActiveSession(session);
      
      // Register tool after connection is established
      try {
        console.log('📧 Registering sendEmailToCreator tool with agent...');
        
        // Create tool with invoke function
        const emailTool = {
          type: "function" as const,
          name: "sendEmailToCreator",
          description: "Send an email message to the creator/developer Prabhat. Use this when the user wants to contact, email, or send a message to the creator, developer, or Prabhat.",
          parameters: {
            type: "object" as const,
            properties: {
              message: { 
                type: "string" as const, 
                description: "The message content to send to the creator" 
              },
              contactInfo: { 
                type: "string" as const, 
                description: "Optional email address or name of the sender for follow-up" 
              }
            },
            required: ["message"] as const,
            additionalProperties: false
          },
          strict: false,
          needsApproval: async () => false,
          invoke: async (args: any) => {
            console.log('📧 Email tool invoke called with full args:', JSON.stringify(args, null, 2));
            
            // The SDK passes args in the context.history array
            // Find the function_call item and parse its arguments string
            let message = '';
            let contactInfo = 'Anonymous';
            
            try {
              const history = args?.context?.history || [];
              const functionCallItem = history.find((item: any) => item.type === 'function_call');
              
              if (functionCallItem && functionCallItem.arguments) {
                // Parse the JSON string containing the actual arguments
                const parsedArgs = JSON.parse(functionCallItem.arguments);
                message = parsedArgs.message || '';
                contactInfo = parsedArgs.contactInfo || 'Anonymous';
              }
            } catch (parseError) {
              console.error('📧 Error parsing arguments:', parseError);
            }
            
            console.log('📧 Extracted message:', message);
            console.log('📧 Extracted contactInfo:', contactInfo);
            
            try {
              const response = await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  message: message,
                  userEmail: contactInfo,
                  sessionId: 'realtime-tool-invoke'
                })
              });
              const result: any = await response.json();
              if (result?.success) {
                console.log('✅ Email sent successfully:', result);
              } else {
                console.error('❌ Email send failed:', result);
              }
              return result;
            } catch (error) {
              console.error('❌ Email tool invoke error:', error);
              return { success: false, error: String(error) };
            }
          }
        };
        
        // Add tool directly to agent's tools array
        if (!(agent as any).tools) {
          (agent as any).tools = [];
        }
        (agent as any).tools.push(emailTool);
        console.log('✅ Email tool added to agent.tools array');
        
        // Also register with OpenAI API via session.update
        const send = getSessionSend(session as any);
        if (send) {
          await send({
            type: 'session.update',
            session: {
              tools: [{
                type: "function",
                name: "sendEmailToCreator",
                description: "Send an email message to the creator/developer Prabhat. Use this when the user wants to contact, email, or send a message to the creator, developer, or Prabhat.",
                parameters: {
                  type: "object",
                  properties: {
                    message: { 
                      type: "string", 
                      description: "The message content to send to the creator" 
                    },
                    contactInfo: { 
                      type: "string", 
                      description: "Optional email address or name of the sender for follow-up" 
                    }
                  },
                  required: ["message"]
                }
              }]
            }
          });
          console.log('✅ Tool definition sent to OpenAI API via session.update');
        }
        
      } catch (error) {
        console.error('❌ Failed to register email tool:', error);
      }
      
      // Flush any pending external context
      if ((window as any).__pendingExternalContext) {
        const pending = (window as any).__pendingExternalContext;
        (window as any).__pendingExternalContext = null;
        await injectExternalContext(pending);
      }
    }
    
    if (ok) {
      console.log('✅ OpenAI Agent initialized and connected with WebRTC');
      setVoiceState('idle');
      return session;
    } else {
      throw new Error('Failed to establish WebRTC connection');
    }
    
  } catch (error) {
    console.error('❌ Failed to initialize OpenAI Agent:', error);
    
    // Check if it's a WebRTC connection error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('setRemoteDescription') || errorMessage.includes('SessionDescription')) {
      console.log('🔧 WebRTC connection error detected. You can:');
      console.log('1. Call __hexaReset() in console to reset the session');
      console.log('2. Reload the page');
      console.log('3. Wait a few minutes and try again');
      
      // Expose the error for manual recovery
      (window as any).__hexaLastError = error;
    }
    
    setVoiceState('error');
    onError?.('Failed to initialize OpenAI Agent');
    return null;
  }
};
