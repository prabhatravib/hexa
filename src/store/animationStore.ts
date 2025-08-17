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
  
  // Internal timer references
  _blinkTimer?: NodeJS.Timeout;
  
  // Voice interaction states
  voiceState: VoiceState;
  isVoiceActive: boolean;
  isSpeaking: boolean;
  speechIntensity: number; // 0-1 for mouth animation
  
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
  
  // Cleanup
  cleanup: () => void;
}

export const useAnimationStore = create<AnimationStore>((set, get) => ({
  // Initial states
  animationState: 'idle',
  expressionState: 'happy',
  isBlinking: false,
  isPulsing: true,
  
  // Internal timer references
  _blinkTimer: undefined,
  
  // Voice interaction states
  voiceState: 'idle',
  isVoiceActive: false,
  isSpeaking: false,
  speechIntensity: 0,
  
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
  
  // Animation triggers
  triggerBlink: () => {
    set({ isBlinking: true });
    setTimeout(() => set({ isBlinking: false }), TIMING.BLINK_DURATION);
  },
  
  startIdleAnimation: () => {
    set({ animationState: 'idle', isPulsing: true });
    // Set up blink interval with random timing
    const scheduleBlink = () => {
      const delay = getRandomBlinkDelay();
      const timer = setTimeout(() => {
        if (Math.random() < 0.3) { // 30% chance to blink
          get().triggerBlink();
        }
        // Only schedule next blink if still in idle state
        if (get().animationState === 'idle' && get().isPulsing) {
          scheduleBlink();
        }
      }, delay);
      
      // Store timer reference for cleanup
      get()._blinkTimer = timer;
    };
    
    scheduleBlink();
  },
  
  stopIdleAnimation: () => {
    set({ isPulsing: false });
    // Clean up blink timer if it exists
    const currentState = get();
    if (currentState._blinkTimer) {
      clearTimeout(currentState._blinkTimer);
      set({ _blinkTimer: undefined });
    }
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
      expressionState: 'happy'
    });
  },
  
  stopSpeaking: () => {
    set({ 
      voiceState: 'idle',
      isSpeaking: false,
      isVoiceActive: false,
      animationState: 'idle',
      expressionState: 'happy',
      speechIntensity: 0
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
  
  // Cleanup function
  cleanup: () => {
    const currentState = get();
    if (currentState._blinkTimer) {
      clearTimeout(currentState._blinkTimer);
      set({ _blinkTimer: undefined });
    }
  },
}));
