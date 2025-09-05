import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AnimatedHexagon } from './animated/AnimatedHexagon';
import { useAnimationStore } from '@/store/animationStore';

interface HexagonContainerProps {
  size?: number;
  className?: string;
}

export const HexagonContainer: React.FC<HexagonContainerProps> = ({
  size = 300,
  className = ''
}) => {
  const { isVoiceDisabled, setVoiceDisabled } = useAnimationStore();

  const toggleVoice = () => {
    setVoiceDisabled(!isVoiceDisabled);
  };

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {/* Toggle Button - Centered above hexagon */}
      <motion.button
        onClick={toggleVoice}
        className="relative inline-flex items-center justify-center px-6 py-3 bg-black text-white rounded-full font-medium text-sm transition-all duration-200 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <span className="flex items-center gap-2">
          <motion.span
            className="w-2 h-2 rounded-full bg-white"
            animate={{
              scale: !isVoiceDisabled ? [1, 1.2, 1] : 1,
              opacity: !isVoiceDisabled ? [1, 0.7, 1] : 1
            }}
            transition={{
              duration: 1,
              repeat: !isVoiceDisabled ? Infinity : 0
            }}
          />
          Voice {!isVoiceDisabled ? 'ON' : 'OFF'}
        </span>
      </motion.button>

      {/* Hexagon Frame with Overlay */}
      <div className="relative" style={{ width: size, height: size }}>
        {/* Hexagon */}
        <AnimatedHexagon size={size} />
        
        {/* Glassy Overlay - Only visible when voice is OFF */}
        <AnimatePresence>
          {isVoiceDisabled && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                backdropFilter: 'blur(15px)',
                borderRadius: '50%',
                mixBlendMode: 'overlay'
              }}
            >
              {/* Disabled Icon with Animation */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                className="text-white/60 text-4xl"
              >
                🔇
              </motion.div>
              
              {/* Subtle pulse effect */}
              <motion.div
                className="absolute inset-0 rounded-full border-2 border-white/20"
                animate={{
                  scale: [1, 1.1, 1],
                  opacity: [0.3, 0.1, 0.3]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Status Display - Below hexagon */}
      <motion.div
        className="text-center"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <motion.div
          className={`text-sm font-medium ${!isVoiceDisabled ? 'text-green-600' : 'text-gray-500'}`}
          animate={{
            color: !isVoiceDisabled ? '#059669' : '#6b7280'
          }}
        >
          Voice: {!isVoiceDisabled ? 'ON' : 'OFF'}
        </motion.div>
        <div className="text-xs text-gray-400 mt-1">
          {!isVoiceDisabled ? 'Ready to listen' : 'Voice disabled'}
        </div>
      </motion.div>
    </div>
  );
};
