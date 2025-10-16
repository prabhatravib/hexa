import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationStore } from '@/store/animationStore';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
  type: 'voice' | 'text';
  source: 'voice' | 'text'; // Add source tracking
}

interface ChatPanelProps {
  transcript: string | null;
  response: string | null;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  onSendMessage?: (text: string) => Promise<boolean>;
  isAgentReady?: boolean;
  enhancedMode?: boolean; // Controls whether to show feature count buttons
  aspectCount?: number; // Number of aspect buttons to show (2-10, default 7)
}

type AspectNumber = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

interface AspectMessages {
  voice: Message[];
  text: Message[];
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  transcript,
  response,
  isMinimized = false,
  onToggleMinimize,
  onSendMessage,
  isAgentReady = false,
  enhancedMode = false, // Default to false for backward compatibility
  aspectCount = 7 // Default to 7 for backward compatibility
}) => {
  const [activeTab, setActiveTab] = useState<'voice' | 'text'>('voice');
  const [responseDestination, setResponseDestination] = useState<'voice' | 'text'>('voice');
  const [voiceMessages, setVoiceMessages] = useState<Message[]>([]);
  const [textMessages, setTextMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pendingTextMessagesRef = useRef<Array<{ text: string; expiresAt: number }>>([]);
  const { voiceState, isVoiceDisabled } = useAnimationStore();

  // ENHANCED MODE STATE - Dynamic aspect count
  const [activeAspect, setActiveAspect] = useState<AspectNumber>(1);
  
  // Initialize aspectMessages dynamically based on aspectCount
  const [aspectMessages, setAspectMessages] = useState<Record<AspectNumber, AspectMessages>>(() => {
    const messages: Record<AspectNumber, AspectMessages> = {} as Record<AspectNumber, AspectMessages>;
    for (let i = 1; i <= aspectCount; i++) {
      messages[i as AspectNumber] = { voice: [], text: [] };
    }
    return messages;
  });
  
  const [isProcessingTextMessage, setIsProcessingTextMessage] = useState(false);

  // Update aspectMessages when aspectCount changes
  useEffect(() => {
    setAspectMessages(prev => {
      const newMessages: Record<AspectNumber, AspectMessages> = {} as Record<AspectNumber, AspectMessages>;
      
      // Preserve existing messages for aspects that still exist
      for (let i = 1; i <= aspectCount; i++) {
        newMessages[i as AspectNumber] = prev[i as AspectNumber] || { voice: [], text: [] };
      }
      
      return newMessages;
    });
    
    // Reset activeAspect if it's beyond the new count
    if (activeAspect > aspectCount) {
      setActiveAspect(1);
    }
  }, [aspectCount, activeAspect]);

  const canSend = Boolean(onSendMessage) && !isVoiceDisabled && isAgentReady;
  const TEXT_TRANSCRIPT_IGNORE_MS = 3000;

  // Choose message handling based on mode
  const currentVoiceMessages = enhancedMode ? aspectMessages[activeAspect]?.voice || [] : voiceMessages;
  const currentTextMessages = enhancedMode ? aspectMessages[activeAspect]?.text || [] : textMessages;

  useEffect(() => {
    if (!transcript) {
      return;
    }

    const normalizedTranscript = transcript.trim();
    if (!normalizedTranscript) {
      return;
    }

    const now = Date.now();
    pendingTextMessagesRef.current = pendingTextMessagesRef.current.filter(
      pending => pending.expiresAt > now
    );

    const pendingMatch = pendingTextMessagesRef.current.find(
      pending => pending.text === normalizedTranscript
    );

    if (pendingMatch) {
      pendingMatch.expiresAt = now + TEXT_TRANSCRIPT_IGNORE_MS;
      return;
    }

    // Only add to voice messages if this is NOT from a text message we just sent
    if (!isProcessingTextMessage) {
      const newMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: normalizedTranscript,
        timestamp: new Date(),
        type: 'voice',
        source: 'voice'
      };

      if (enhancedMode) {
        setAspectMessages(prev => ({
          ...prev,
          [activeAspect]: {
            ...prev[activeAspect],
            voice: [...prev[activeAspect].voice, newMessage]
          }
        }));
      } else {
        setVoiceMessages(prev => [...prev, newMessage]);
      }
      setResponseDestination('voice');
    }
  }, [transcript, isProcessingTextMessage, enhancedMode, activeAspect]);

  useEffect(() => {
    if (response && response.trim()) {
      // Capture responseDestination at the time response arrives to prevent re-runs
      const currentDestination = responseDestination;
      const newMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: response,
        timestamp: new Date(),
        type: currentDestination,
        source: currentDestination // Assistant messages inherit the source from their destination
      };

      if (enhancedMode) {
        setAspectMessages(prev => ({
          ...prev,
          [activeAspect]: {
            ...prev[activeAspect],
            [currentDestination]: [...prev[activeAspect][currentDestination], newMessage]
          }
        }));
      } else {
        if (currentDestination === 'voice') {
          setVoiceMessages(prev => [...prev, newMessage]);
        } else {
          setTextMessages(prev => [...prev, newMessage]);
        }
      }
    }
  }, [response, responseDestination, enhancedMode, activeAspect]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTab === 'voice' ? currentVoiceMessages : currentTextMessages]);

  useEffect(() => {
    if (errorMessage && draft.length === 0) {
      setErrorMessage(null);
    }
  }, [draft, errorMessage]);

  const sendMessage = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      return;
    }

    if (!onSendMessage || !isAgentReady) {
      setErrorMessage('Voice agent is still connecting');
      return;
    }

    if (isVoiceDisabled) {
      setErrorMessage('Voice is currently disabled');
      return;
    }

    setIsSending(true);
    setErrorMessage(null);
    setIsProcessingTextMessage(true); // Mark that we're processing a text message

    try {
      const success = await onSendMessage(trimmed);
      if (success) {
        pendingTextMessagesRef.current.push({
          text: trimmed,
          expiresAt: Date.now() + TEXT_TRANSCRIPT_IGNORE_MS
        });
        setResponseDestination('text');

        // Add user message to text messages with source tracking
        const userMessage: Message = {
          id: `user-${Date.now()}`,
          role: 'user',
          text: trimmed,
          timestamp: new Date(),
          type: 'text',
          source: 'text'
        };

        if (enhancedMode) {
          setAspectMessages(prev => ({
            ...prev,
            [activeAspect]: {
              ...prev[activeAspect],
              text: [...prev[activeAspect].text, userMessage]
            }
          }));
        } else {
          setTextMessages(prev => [...prev, userMessage]);
        }
        setDraft('');
      } else {
        setErrorMessage('Message could not be delivered');
      }
    } catch (error) {
      console.error('Failed to send chat panel message:', error);
      setErrorMessage('Message could not be delivered');
    } finally {
      setIsSending(false);
      // Reset the flag after a short delay to ensure transcript processing is complete
      setTimeout(() => setIsProcessingTextMessage(false), 100);
    }
  }, [draft, onSendMessage, canSend, isProcessingTextMessage, enhancedMode, activeAspect]);

  const handleSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void sendMessage();
  }, [sendMessage]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }, [sendMessage]);

  const clearAllAspects = useCallback(() => {
    if (enhancedMode) {
      const newMessages: Record<AspectNumber, AspectMessages> = {} as Record<AspectNumber, AspectMessages>;
      for (let i = 1; i <= aspectCount; i++) {
        newMessages[i as AspectNumber] = { voice: [], text: [] };
      }
      setAspectMessages(newMessages);
    } else {
      setVoiceMessages([]);
      setTextMessages([]);
    }
  }, [enhancedMode, aspectCount]);

  // Legacy clear functions for backward compatibility
  const clearVoiceMessages = useCallback(() => {
    if (enhancedMode) {
      clearAllAspects();
    } else {
      setVoiceMessages([]);
    }
  }, [enhancedMode, clearAllAspects]);

  const clearTextMessages = useCallback(() => {
    if (enhancedMode) {
      clearAllAspects();
    } else {
      setTextMessages([]);
    }
  }, [enhancedMode, clearAllAspects]);

  const statusText = errorMessage
    ? errorMessage
    : !isAgentReady
      ? 'Connecting voice agent...'
      : isVoiceDisabled
        ? 'Voice disabled'
        : voiceState === 'listening'
          ? 'Listening...'
          : voiceState === 'thinking'
            ? 'Thinking...'
            : voiceState === 'speaking'
              ? 'Speaking...'
              : voiceState === 'error'
                ? 'Error'
                : enhancedMode
                  ? 'Enhanced Mode - Ready'
                  : 'Ready';

  const computedRows = Math.min(4, Math.max(2, draft.split(/\r?\n/).length));

  return (
    <motion.div
      className={`fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-600 transition-all duration-300 flex flex-col ${
        isMinimized ? 'w-80' : `w-96 ${enhancedMode ? 'h-[580px]' : 'h-[500px]'}`
      }`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Minimize/Maximize Button - Positioned above tabs */}
      {onToggleMinimize && (
        <div className="flex justify-center -mb-1 relative z-10">
          <button
            onClick={onToggleMinimize}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-t-lg px-3 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
            aria-label={isMinimized ? 'Expand chat' : 'Minimize chat'}
          >
            <div className={`w-0 h-0 border-l-[6px] border-r-[6px] border-l-transparent border-r-transparent ${
              isMinimized
                ? 'border-t-[8px] border-t-gray-600 dark:border-t-gray-400'
                : 'border-b-[8px] border-b-gray-400 dark:border-b-gray-600'
            }`} />
          </button>
        </div>
      )}

      {/* Horizontal Tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
        <button
          onClick={() => setActiveTab('voice')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'voice'
              ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`}
          aria-label="Voice conversations"
        >
          🎤 Voice chat
        </button>
        <button
          onClick={() => setActiveTab('text')}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            activeTab === 'text'
              ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 border-b-2 border-blue-500'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600'
          }`}
          aria-label="Text conversations"
        >
          💬 Text chat
        </button>
      </div>

      {/* Aspect Selection Buttons - Only show in enhanced mode */}
      {enhancedMode && (
        <div className="flex border-b border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-750 px-2 py-2 gap-1 overflow-x-auto">
          {Array.from({ length: aspectCount }, (_, i) => i + 1).map(aspectNum => (
            <button
              key={aspectNum}
              onClick={() => setActiveAspect(aspectNum as AspectNumber)}
              className={`flex-shrink-0 w-10 h-10 rounded-md text-sm font-semibold transition-all ${
                activeAspect === aspectNum
                  ? 'bg-blue-500 text-white shadow-md scale-105'
                  : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600'
              }`}
              aria-label={`Aspect ${aspectNum}`}
            >
              {aspectNum}
            </button>
          ))}
        </div>
      )}

      {/* Content Area - Only show when not minimized */}
      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeTab === 'voice' ? (
              <>
                {currentVoiceMessages.length === 0 && (
                  <div className="text-center text-gray-400 text-sm mt-8">
                    Start talking to the hexagon
                  </div>
                )}

                {currentVoiceMessages.map((message) => {
                  const isUserMessage = message.role === 'user';
                  const isVoiceInput = message.type === 'voice' && message.source === 'voice';
                  const isTextInput = message.type === 'text' && message.source === 'text';

                  let bubbleClasses = '';
                  let timestampClasses = '';

                  if (isUserMessage) {
                    // User messages: green for text input, blue for voice input
                    if (isTextInput) {
                      bubbleClasses = 'bg-green-500 text-white';
                      timestampClasses = 'text-green-100';
                    } else if (isVoiceInput) {
                      bubbleClasses = 'bg-blue-500 text-white';
                      timestampClasses = 'text-blue-100';
                    } else {
                      bubbleClasses = 'bg-blue-500 text-white';
                      timestampClasses = 'text-blue-100';
                    }
                  } else {
                    // Assistant messages: gray
                    bubbleClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
                    timestampClasses = 'text-gray-500 dark:text-gray-400';
                  }

                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, x: isUserMessage ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] px-4 py-2 rounded-lg ${bubbleClasses}`}>
                        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                        <p className={`text-[8px] mt-1 font-normal leading-tight ${timestampClasses}`}>
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </>
            ) : (
              <>
                {currentTextMessages.length === 0 && (
                  <div className="text-center text-gray-400 text-sm mt-8">
                    Start typing to begin text conversation
                  </div>
                )}

                {currentTextMessages.map((message) => {
                  const isUserMessage = message.role === 'user';
                  const isVoiceInput = message.type === 'voice' && message.source === 'voice';
                  const isTextInput = message.type === 'text' && message.source === 'text';

                  let bubbleClasses = '';
                  let timestampClasses = '';

                  if (isUserMessage) {
                    // User messages: green for text input, blue for voice input
                    if (isTextInput) {
                      bubbleClasses = 'bg-green-500 text-white';
                      timestampClasses = 'text-green-100';
                    } else if (isVoiceInput) {
                      bubbleClasses = 'bg-blue-500 text-white';
                      timestampClasses = 'text-blue-100';
                    } else {
                      bubbleClasses = 'bg-blue-500 text-white';
                      timestampClasses = 'text-blue-100';
                    }
                  } else {
                    // Assistant messages: gray
                    bubbleClasses = 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
                    timestampClasses = 'text-gray-500 dark:text-gray-400';
                  }

                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, x: isUserMessage ? 20 : -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex ${isUserMessage ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] px-4 py-2 rounded-lg ${bubbleClasses}`}>
                        <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                        <p className={`text-[8px] mt-1 font-normal leading-tight ${timestampClasses}`}>
                          {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                        </p>
                      </div>
                    </motion.div>
                  );
                })}
              </>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area - Only show in Text Chat mode */}
          {activeTab === 'text' && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex-shrink-0">
              <form onSubmit={handleSubmit} className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={!canSend || isSending}
                    placeholder={!isAgentReady
                      ? 'Voice agent is connecting...'
                      : isVoiceDisabled
                        ? 'Voice agent is disabled'
                        : 'Type your message...'}
                    className="flex-1 resize-none rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-700 dark:text-gray-200 p-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:cursor-not-allowed"
                    rows={computedRows}
                  />
                  <button
                    type="submit"
                    disabled={!canSend || isSending || !draft.trim()}
                    className="h-10 px-4 rounded-md bg-blue-500 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
                  >
                    {isSending ? 'Sending...' : 'Send'}
                  </button>
                </div>
              </form>
              <div className="mt-2 flex items-center justify-between">
                <span className={`text-xs ${errorMessage ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                  {statusText}
                </span>
                <button
                  type="button"
                  onClick={() => enhancedMode ? clearAllAspects() : setTextMessages([])}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Clear button for Voice Chat - Show when in voice mode */}
          {activeTab === 'voice' && !isMinimized && (
            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between">
                <span className={`text-xs ${errorMessage ? 'text-red-500' : 'text-gray-500 dark:text-gray-400'}`}>
                  {statusText}
                </span>
                <button
                  type="button"
                  onClick={() => enhancedMode ? clearAllAspects() : setVoiceMessages([])}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Clear
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </motion.div>
  );
};
