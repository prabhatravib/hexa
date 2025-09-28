import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimationStore } from '@/store/animationStore';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  timestamp: Date;
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { voiceState, isVoiceDisabled } = useAnimationStore();

  const canSend = Boolean(onSendMessage) && !isVoiceDisabled && isAgentReady;

  useEffect(() => {
    if (transcript && transcript.trim()) {
      const newMessage: Message = {
        id: `user-${Date.now()}`,
        role: 'user',
        text: transcript,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, newMessage]);
    }
  }, [transcript]);

  useEffect(() => {
    if (response && response.trim()) {
      const newMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, newMessage]);
    }
  }, [response]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
    try {
      const success = await onSendMessage(trimmed);
      if (success) {
        setDraft('');
      } else {
        setErrorMessage('Message could not be delivered');
      }
    } catch (error) {
      console.error('Failed to send chat panel message:', error);
      setErrorMessage('Message could not be delivered');
    } finally {
      setIsSending(false);
    }
  }, [draft, onSendMessage, canSend]);

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
      className={`fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-600 transition-all duration-300 ${
        isMinimized ? 'w-80 h-12' : 'w-96 h-[500px]'
      }`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 rounded-t-lg">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            voiceState === 'speaking' ? 'bg-green-500 animate-pulse' : 
            voiceState === 'listening' ? 'bg-blue-500 animate-pulse' : 
            'bg-gray-400'
          }`} />
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Voice Chat
          </h3>
        </div>
        <button
          onClick={onToggleMinimize}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 p-1 rounded transition-colors"
          aria-label={isMinimized ? 'Expand chat' : 'Minimize chat'}
        >
          {isMinimized ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
            </svg>

          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>

          )}
        </button>
      </div>

      <AnimatePresence>
        {!isMinimized && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'calc(100% - 48px)', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="flex flex-col h-full overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 && (
                <div className="text-center text-gray-400 text-sm mt-8">
                  Click the hexagon to start talking
                </div>
              )}

              {messages.map((message) => (
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

              <div ref={messagesEndRef} />
            </div>

            <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
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
                  onClick={() => setMessages([])}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                >
                  Clear
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
