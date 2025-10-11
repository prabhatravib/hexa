import { create } from 'zustand';
import { TIMING, getRandomBlinkDelay } from '@/animations/constants';

export type AnimationState = 'idle' | 'hover' | 'active';
export type ExpressionState = 'happy' | 'neutral' | 'curious' | 'excited';
export type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error' | 'retrying' | 'disabled';
export type InitializationState = 'initializing' | 'connecting' | 'ready' | 'error';

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
  isVoiceDisabled: boolean; // New state for voice toggle
  vadSpeaking: boolean; // VAD detection flag - true when voice activity detected
  isAudioPlaying: boolean; // Track if audio element is actually playing
  
  // Initialization state
  initializationState: InitializationState;
  initializationProgress: number; // 0-100
  
  /**
   * Target mouth openness value for animation.
   * Range: 0 (closed) to 1 (fully open).
   * This is a target value only - components must animate locally to reach this target.
   * The store does not handle animation loops or continuous updates.
   */
  mouthOpennessTarget: number;
  
  /**
   * Timestamp (Date.now()) of the last time mouthOpennessTarget was updated with a non-zero value.
   * Used by the watchdog to detect stale analyzer data.
   */
  mouthTargetUpdatedAt: number;
  

  
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
  setVoiceDisabled: (disabled: boolean) => void;
  setVadSpeaking: (speaking: boolean) => void;
  setAudioPlaying: (playing: boolean) => void;
  
  // Initialization state setters
  setInitializationState: (state: InitializationState) => void;
  setInitializationProgress: (progress: number) => void;
  
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
  
  // Utility functions
  isReadyForInteraction: () => boolean;
  
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
  isVoiceDisabled: false,
  vadSpeaking: false,
  isAudioPlaying: false,
  
  // Initialization state
  initializationState: 'initializing',
  initializationProgress: 0,
  
  // Mouth animation target
  mouthOpennessTarget: 0,
  mouthTargetUpdatedAt: 0,
  
  // State setters
  setAnimationState: (state) => set({ animationState: state }),
  setExpressionState: (expression) => set({ expressionState: expression }),
  setBlinking: (blinking) => set({ isBlinking: blinking }),
  setPulsing: (pulsing) => set({ isPulsing: pulsing }),
  
  // Voice state setters
  setVoiceState: (state) => {
    set({ voiceState: state });
    // Also update global state for debugging
    (window as any).__currentVoiceState = state;
  },
  setVoiceActive: (active) => set({ isVoiceActive: active }),
  setSpeaking: (speaking) => set({ isSpeaking: speaking }),
  setSpeechIntensity: (intensity) => set({ speechIntensity: intensity }),
  setVoiceDisabled: (disabled) => set({ isVoiceDisabled: disabled }),
  setVadSpeaking: (speaking) => set({ vadSpeaking: speaking }),
  setAudioPlaying: (playing) => set({ isAudioPlaying: playing }),
  
  // Initialization state setters
  setInitializationState: (state) => set({ initializationState: state }),
  setInitializationProgress: (progress) => set({ initializationProgress: Math.max(0, Math.min(100, progress)) }),
  
  // Mouth target setters
  setMouthTarget: (value) => {
    // console.log(`🎯 setMouthTarget called with: ${value}`);
    
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
    // console.log(`🎯 Setting mouth target to: ${clampedValue.toFixed(3)}`);
    
    // Update timestamp when setting non-zero values (indicates active analyzer data)
    const updates: { mouthOpennessTarget: number; mouthTargetUpdatedAt?: number } = {
      mouthOpennessTarget: clampedValue
    };
    if (clampedValue > 0.02) { // Only update timestamp for meaningful mouth movement
      updates.mouthTargetUpdatedAt = Date.now();
    }
    
    set(updates);
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
    console.log('🎤 startSpeaking() called - starting voice interaction');
    
    set({ 
      voiceState: 'speaking',
      isSpeaking: true,
      animationState: 'active',
      expressionState: 'happy'
    });
    
    // Expose current voice state globally for debugging
    (window as any).__currentVoiceState = 'speaking';
    
    console.log('🎤 Voice state set to speaking - mouth will be driven by audio intensity');
  },
  
  stopSpeaking: () => {
    console.log('🔇 stopSpeaking() called - stopping voice interaction');
    
    set({ 
      voiceState: 'idle',
      isSpeaking: false,
      isVoiceActive: false,
      animationState: 'idle',
      expressionState: 'happy',
      speechIntensity: 0,
      mouthOpennessTarget: 0, // Reset mouth to closed position
      vadSpeaking: false // Reset VAD flag
    });
    
    // Clear global voice state
    (window as any).__currentVoiceState = 'idle';
    
    console.log('🔇 Voice state set to idle - mouth animation stopped');
  },
  
  // Utility functions
  isReadyForInteraction: () => {
    return get().voiceState === 'idle' && get().isSpeaking === false;
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
