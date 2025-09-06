import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle } from 'lucide-react';

interface LoadingOverlayProps {
  isVisible: boolean;
  initializationState: 'initializing' | 'connecting' | 'ready' | 'error';
  initializationProgress: number;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  isVisible,
  initializationState,
  initializationProgress
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          className="absolute inset-0 z-20 flex flex-col items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >


          {/* Progress bar and percentage - Centered inside hexagon */}
          {(initializationState === 'initializing' || initializationState === 'connecting') && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="flex flex-col items-center space-y-2">
                <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-blue-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${initializationProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <span className="text-xs text-gray-300">{initializationProgress}%</span>
              </div>
            </div>
          )}
          
          {initializationState === 'error' && (
            <div className="mt-6 flex flex-col items-center space-y-2">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <span className="text-sm text-white font-medium">Connection Failed</span>
              <span className="text-xs text-gray-300 text-center px-2">Please refresh the page to retry</span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface TranscriptDisplayProps {
  transcript: string | null;
}

export const TranscriptDisplay: React.FC<TranscriptDisplayProps> = ({ transcript }) => {
  return (
    <AnimatePresence>
      {transcript && (
        <motion.div
          className="absolute -top-20 left-1/2 transform -translate-x-1/2 
                   bg-white dark:bg-gray-800 rounded-lg shadow-lg p-3 
                   max-w-xs whitespace-nowrap z-10 border border-gray-200 dark:border-gray-600"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
        >
          <p className="text-sm text-gray-700 dark:text-gray-300 text-center">
            "{transcript}"
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface ResponseDisplayProps {
  response: string | null;
}

export const ResponseDisplay: React.FC<ResponseDisplayProps> = ({ response }) => {
  return (
    <AnimatePresence>
      {response && (
        <motion.div
          className="absolute -top-20 left-1/2 transform -translate-x-1/2 
                   bg-blue-50 dark:bg-blue-900 rounded-lg shadow-lg p-3 
                   max-w-md z-10 border border-blue-200 dark:border-blue-700"
          initial={{ opacity: 0, y: 10 }}
          exit={{ opacity: 0, y: 10 }}
        >
          <p className="text-sm text-blue-700 dark:text-blue-300 text-center">
            {response}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

interface StatusTextProps {
  initializationState: 'initializing' | 'connecting' | 'ready' | 'error';
}

export const StatusText: React.FC<StatusTextProps> = ({ initializationState }) => {
  return (
    <AnimatePresence>
      {initializationState !== 'ready' && (
        <motion.div
          className="absolute -bottom-8 left-1/2 transform -translate-x-1/2 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
        >
          <p className="text-sm text-gray-600 dark:text-gray-400 font-medium">
            {initializationState === 'initializing' && 'Initializing voice system...'}
            {initializationState === 'connecting' && 'Connecting to voice service...'}
            {initializationState === 'error' && 'Connection failed'}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
