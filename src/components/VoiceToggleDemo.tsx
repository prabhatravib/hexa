import React from 'react';
import { motion } from 'framer-motion';
import { useAnimationStore } from '@/store/animationStore';

/**
 * Demo component to showcase the voice toggle functionality
 * This can be used for testing and demonstration purposes
 */
export const VoiceToggleDemo: React.FC = () => {
  const { isVoiceDisabled, setVoiceDisabled, voiceState, isVoiceActive } = useAnimationStore();

  return (
    <div className="fixed top-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 border border-gray-200 dark:border-gray-600 z-50">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
        Voice Toggle Demo
      </h3>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600 dark:text-gray-400">Voice Status:</span>
          <span className={`text-xs font-medium ${
            isVoiceDisabled ? 'text-red-500' : 'text-green-500'
          }`}>
            {isVoiceDisabled ? 'DISABLED' : 'ENABLED'}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600 dark:text-gray-400">Voice State:</span>
          <span className="text-xs font-medium text-blue-500">
            {voiceState.toUpperCase()}
          </span>
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600 dark:text-gray-400">Active:</span>
          <span className={`text-xs font-medium ${
            isVoiceActive ? 'text-green-500' : 'text-gray-500'
          }`}>
            {isVoiceActive ? 'YES' : 'NO'}
          </span>
        </div>
        
        <motion.button
          onClick={() => setVoiceDisabled(!isVoiceDisabled)}
          className="w-full mt-3 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {isVoiceDisabled ? 'Enable Voice' : 'Disable Voice'}
        </motion.button>
      </div>
    </div>
  );
};
