import { create } from 'zustand';
import { TIMING, getRandomBlinkDelay } from '@/animations/constants';

export type AnimationState = 'idle' | 'hover' | 'active';
export type ExpressionState = 'happy' | 'neutral' | 'curious' | 'excited';
export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface AnimationStore {
  // Current states
  animationState: AnimationState;
  expressionState: ExpressionState;
  isBlinking: boolean;
  isPulsing: boolean;
  
  // Voice interaction states
  voiceState: VoiceState;
  isVoiceActive: boolean;
  isSpeaking: boolean;
  speechIntensity: number; // 0-1 for mouth animation
  
  /**
   * Target mouth openness value for animation.
   * Range: 0 (closed) to 1 (fully open).
   * This is a target value only - components must animate locally to reach this target.
   * The store does not handle animation loops or continuous updates.
   */
  mouthOpennessTarget: number;
  
  // State setters
  setAnimationState: (state: AnimationState) => void;
  setExpressionState: (expression: ExpressionState) => void;
  setBlinking: (blinking: boolean) => void;
  setPulsing: (pulsing: boolean) => void;
  
  // Voice state setters
  setVoiceState: (state: VoiceState) => void;
  setVoiceActive: (active: boolean) => void;
  setSpeaking: (speaking: boolean) => void;
  setSpeechIntensity: (intensity: number) => void;
  
  /**
   * Sets the target mouth openness value.
   * @param value - Target openness value (0-1). Will be clamped to valid range.
   * @throws In development: logs warning for invalid values (NaN, <0, >1)
   */
  setMouthTarget: (value: number) => void;
  
  /**
   * Resets mouth openness target to closed position (0).
   */
  resetMouth: () => void;
  
  // Animation triggers
  triggerBlink: () => void;
  startIdleAnimation: () => void;
  stopIdleAnimation: () => void;
  
  // Voice interaction handlers
  startListening: () => void;
  stopListening: () => void;
  startSpeaking: () => void;
  stopSpeaking: () => void;
  
  // Interaction handlers
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
  handleClick: () => void;
}

export const useAnimationStore = create<AnimationStore>((set, get) => ({
  // Initial states
  animationState: 'idle',
  expressionState: 'happy',
  isBlinking: false,
  isPulsing: false, // Disabled continuous pulsing to remove interior effect
  
  // Voice interaction states
  voiceState: 'idle',
  isVoiceActive: false,
  isSpeaking: false,
  speechIntensity: 0,
  
  // Mouth animation target
  mouthOpennessTarget: 0,
  
  // State setters
  setAnimationState: (state) => set({ animationState: state }),
  setExpressionState: (expression) => set({ expressionState: expression }),
  setBlinking: (blinking) => set({ isBlinking: blinking }),
  setPulsing: (pulsing) => set({ isPulsing: pulsing }),
  
  // Voice state setters
  setVoiceState: (state) => set({ voiceState: state }),
  setVoiceActive: (active) => set({ isVoiceActive: active }),
  setSpeaking: (speaking) => set({ isSpeaking: speaking }),
  setSpeechIntensity: (intensity) => set({ speechIntensity: intensity }),
  
  // Mouth target setters
  setMouthTarget: (value) => {
    // Development warnings for invalid values
    if (process.env.NODE_ENV === 'development') {
      if (isNaN(value)) {
        console.warn('setMouthTarget called with NaN value:', value);
        return;
      }
      if (value < 0 || value > 1) {
        console.warn('setMouthTarget called with value outside 0-1 range:', value);
      }
    }
    
    // Clamp value to valid range and set target
    const clampedValue = Math.max(0, Math.min(1, value));
    set({ mouthOpennessTarget: clampedValue });
  },
  
  resetMouth: () => set({ mouthOpennessTarget: 0 }),
  
  // Animation triggers
  triggerBlink: () => {
    set({ isBlinking: true });
    setTimeout(() => set({ isBlinking: false }), TIMING.BLINK_DURATION);
  },
  
  startIdleAnimation: () => {
    set({ animationState: 'idle', isPulsing: false }); // Disabled pulsing to remove interior effect
    // Set up blink interval with random timing
    const scheduleBlink = () => {
      const delay = getRandomBlinkDelay();
      setTimeout(() => {
        if (Math.random() < 0.3) { // 30% chance to blink
          get().triggerBlink();
        }
        scheduleBlink(); // Schedule next blink
      }, delay);
    };
    
    scheduleBlink();
  },
  
  stopIdleAnimation: () => {
    set({ isPulsing: false });
    // Note: The new blink scheduling is self-contained and doesn't need cleanup
  },
  
  // Voice interaction handlers
  startListening: () => {
    set({ 
      voiceState: 'listening',
      isVoiceActive: true,
      animationState: 'active',
      expressionState: 'curious'
    });
  },
  
  stopListening: () => {
    set({ 
      voiceState: 'thinking',
      expressionState: 'neutral'
    });
  },
  
  startSpeaking: () => {
    set({ 
      voiceState: 'speaking',
      isSpeaking: true,
      animationState: 'active',
      expressionState: 'happy',
      mouthOpennessTarget: 0.5 // Set a default mouth openness when speaking starts
    });
    
    // Start a simple mouth animation pattern while speaking
    const mouthAnimationInterval = setInterval(() => {
      const currentState = get();
      if (currentState.voiceState === 'speaking') {
        // Simple open/close pattern: 0.3 -> 0.7 -> 0.3 -> 0.7...
        const currentTarget = currentState.mouthOpennessTarget;
        const newTarget = currentTarget > 0.5 ? 0.3 : 0.7;
        set({ mouthOpennessTarget: newTarget });
      } else {
        // Stop animation when not speaking
        clearInterval(mouthAnimationInterval);
      }
    }, 200); // Change mouth position every 200ms for a natural talking effect
  },
  
  stopSpeaking: () => {
    set({ 
      voiceState: 'idle',
      isSpeaking: false,
      isVoiceActive: false,
      animationState: 'idle',
      expressionState: 'happy',
      speechIntensity: 0,
      mouthOpennessTarget: 0 // Reset mouth to closed position
    });
  },
  
  // Interaction handlers
  handleMouseEnter: () => {
    set({ animationState: 'hover', expressionState: 'curious' });
  },
  
  handleMouseLeave: () => {
    set({ animationState: 'idle', expressionState: 'happy' });
  },
  
  handleClick: () => {
    set({ animationState: 'active', expressionState: 'excited' });
    get().triggerBlink();
    setTimeout(() => {
      set({ animationState: 'idle', expressionState: 'happy' });
    }, TIMING.CLICK_BOUNCE_DURATION);
  },
}));
