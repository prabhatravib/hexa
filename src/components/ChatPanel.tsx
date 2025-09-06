import React, { useEffect, useRef, useState } from 'react';
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
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ 
  transcript, 
  response,
  isMinimized = false,
  onToggleMinimize
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { voiceState } = useAnimationStore();
  
  // Add user transcript as a message
  useEffect(() => {
    console.log('💬 ChatPanel: Received transcript:', transcript);
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

  
  // Handle AI response
  useEffect(() => {
    console.log('💬 ChatPanel: Received response:', response);
    if (response && response.trim()) {
      // Always add the response as a complete message immediately
      const newMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        text: response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, newMessage]);
    }
  }, [response]);
  
  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  return (
    <motion.div
      className={`fixed bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-600 transition-all duration-300 ${
        isMinimized ? 'w-80 h-12' : 'w-96 h-[500px]'
      }`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
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
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 text-lg font-bold"
        >
          {isMinimized ? '▲' : '▼'}
        </button>
      </div>
      
      {/* Messages Container */}
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
            
            {/* Status Bar */}
            <div className="px-4 py-2 border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {voiceState === 'listening' && '🎤 Listening...'}
                  {voiceState === 'thinking' && '💭 Thinking...'}
                  {voiceState === 'speaking' && '🗣️ Speaking...'}
                  {voiceState === 'idle' && '✨ Ready'}
                  {voiceState === 'error' && '❌ Error'}
                </span>
                <button
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
