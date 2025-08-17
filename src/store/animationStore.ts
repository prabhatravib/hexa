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
  
  // Mouth-specific states for enhanced animation
  isMouthOpen: boolean;
  mouthOpenness: number; // 0-1, driven by speechIntensity
  mouthAnimationSpeed: number; // for smooth transitions
  mouthShape: 'closed' | 'slightly_open' | 'open' | 'wide_open';
  
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
  
  // Mouth control functions
  setMouthOpenness: (openness: number) => void;
  setMouthShape: (shape: 'closed' | 'slightly_open' | 'open' | 'wide_open') => void;
  openMouth: () => void;
  closeMouth: () => void;
  updateMouthFromSpeech: (intensity: number) => void;
  adjustMouthAnimationSpeed: (intensity: number) => void;
  
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
  isPulsing: true,
  
  // Voice interaction states
  voiceState: 'idle',
  isVoiceActive: false,
  isSpeaking: false,
  speechIntensity: 0,
  
  // Mouth-specific states for enhanced animation
  isMouthOpen: false,
  mouthOpenness: 0,
  mouthAnimationSpeed: 0.5, // Default speed
  mouthShape: 'closed',
  
  // State setters
  setAnimationState: (state) => set({ animationState: state }),
  setExpressionState: (expression) => set({ expressionState: expression }),
  setBlinking: (blinking) => set({ isBlinking: blinking }),
  setPulsing: (pulsing) => set({ isPulsing: pulsing }),
  
  // Voice state setters
  setVoiceState: (state) => set({ voiceState: state }),
  setVoiceActive: (active) => set({ isVoiceActive: active }),
  setSpeaking: (speaking) => set({ isSpeaking: speaking }),
  setSpeechIntensity: (intensity) => {
    console.log('🎤 setSpeechIntensity called:', intensity, 'isSpeaking:', get().isSpeaking);
    set({ speechIntensity: intensity });
    // Automatically update mouth states when speech intensity changes
    if (get().isSpeaking) {
      console.log('🎤 Updating mouth states from speech intensity:', intensity);
      get().updateMouthFromSpeech(intensity);
      get().adjustMouthAnimationSpeed(intensity);
    } else {
      console.log('🎤 Not speaking, skipping mouth updates');
    }
  },
  
  // Mouth control functions
  setMouthOpenness: (openness) => set({ mouthOpenness: openness }),
  setMouthShape: (shape) => set({ mouthShape: shape }),
  openMouth: () => set({ isMouthOpen: true }),
  closeMouth: () => set({ isMouthOpen: false }),
  updateMouthFromSpeech: (intensity) => {
    const newOpenness = Math.min(1, Math.max(0, intensity));
    
    // Determine mouth shape based on intensity
    let newShape: 'closed' | 'slightly_open' | 'open' | 'wide_open';
    if (newOpenness > 0.7) {
      newShape = 'wide_open';
    } else if (newOpenness > 0.4) {
      newShape = 'open';
    } else if (newOpenness > 0.1) {
      newShape = 'slightly_open';
    } else {
      newShape = 'closed';
    }
    
    set({ 
      mouthOpenness: newOpenness,
      mouthShape: newShape,
      isMouthOpen: newOpenness > 0.05
    });
  },
  
  adjustMouthAnimationSpeed: (intensity) => {
    // Adjust animation speed based on speech intensity
    // Higher intensity = faster animation for more responsive feel
    const baseSpeed = 0.5;
    const intensityMultiplier = 1 + (intensity * 0.5); // 0.5x to 1.5x speed
    const newSpeed = Math.min(2, Math.max(0.1, baseSpeed * intensityMultiplier));
    set({ mouthAnimationSpeed: newSpeed });
  },
  
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
      isMouthOpen: true,
      mouthOpenness: 0.3, // Start with slight openness
      mouthShape: 'slightly_open'
    });
  },
  
  stopSpeaking: () => {
    set({ 
      voiceState: 'idle',
      isSpeaking: false,
      isVoiceActive: false,
      animationState: 'idle',
      expressionState: 'happy',
      speechIntensity: 0,
      isMouthOpen: false,
      mouthOpenness: 0,
      mouthShape: 'closed'
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
