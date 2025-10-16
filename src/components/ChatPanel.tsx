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
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  transcript,
  response,
  isMinimized = false,
  onToggleMinimize,
  onSendMessage,
  isAgentReady = false
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

  const canSend = Boolean(onSendMessage) && !isVoiceDisabled && isAgentReady;
  const TEXT_TRANSCRIPT_IGNORE_MS = 3000;

  // Add state to track if we're currently processing a text message
  const [isProcessingTextMessage, setIsProcessingTextMessage] = useState(false);

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
      setVoiceMessages(prev => [...prev, newMessage]);
      setResponseDestination('voice');
    }
  }, [transcript, isProcessingTextMessage]);

  useEffect(() => {
    if (response && response.trim()) {
      const destination = responseDestination;
      const newMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: response,
        timestamp: new Date(),
        type: destination,
        source: destination // Assistant messages inherit the source from their destination
      };

      if (destination === 'voice') {
        setVoiceMessages(prev => [...prev, newMessage]);
      } else {
        setTextMessages(prev => [...prev, newMessage]);
      }
    }
  }, [response, responseDestination]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeTab === 'voice' ? voiceMessages : textMessages]);

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
        setTextMessages(prev => [...prev, userMessage]);
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
  }, [draft, onSendMessage, canSend, isProcessingTextMessage]);

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
                : 'Ready';

  const computedRows = Math.min(4, Math.max(2, draft.split(/\r?\n/).length));

  return (
    <motion.div
      className={`fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-600 transition-all duration-300 flex flex-col ${
        isMinimized ? 'w-80' : 'w-96 h-[500px]'
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



      {/* Content Area - Only show when not minimized */}
      {!isMinimized && (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {activeTab === 'voice' ? (
              <>
                {voiceMessages.length === 0 && (
                  <div className="text-center text-gray-400 text-sm mt-8">
                    Click the hexagon to start talking
                  </div>
                )}

                {voiceMessages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, x: message.role === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] px-4 py-2 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                      <p className={`text-xs mt-1 ${
                        message.role === 'user' ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </>
            ) : (
              <>
                {textMessages.length === 0 && (
                  <div className="text-center text-gray-400 text-sm mt-8">
                    Start typing to begin text conversation
                  </div>
                )}

                {textMessages.map((message) => (
                  <motion.div
                    key={message.id}
                    initial={{ opacity: 0, x: message.role === 'user' ? 20 : -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[80%] px-4 py-2 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{message.text}</p>
                      <p className={`text-xs mt-1 ${
                        message.role === 'user' ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'
                      }`}>
                        {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
                      </p>
                    </div>
                  </motion.div>
                ))}
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
                  onClick={() => setTextMessages([])}
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
                  onClick={() => setVoiceMessages([])}
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
