import { create } from 'zustand';
import { TIMING, getRandomBlinkDelay } from '@/animations/constants';

export type AnimationState = 'idle' | 'hover' | 'active';
export type ExpressionState = 'happy' | 'neutral' | 'curious' | 'excited';

interface AnimationStore {
  // Current states
  animationState: AnimationState;
  expressionState: ExpressionState;
  isBlinking: boolean;
  isPulsing: boolean;
  
  // State setters
  setAnimationState: (state: AnimationState) => void;
  setExpressionState: (expression: ExpressionState) => void;
  setBlinking: (blinking: boolean) => void;
  setPulsing: (pulsing: boolean) => void;
  
  // Animation triggers
  triggerBlink: () => void;
  startIdleAnimation: () => void;
  stopIdleAnimation: () => void;
  
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
  
  // State setters
  setAnimationState: (state) => set({ animationState: state }),
  setExpressionState: (expression) => set({ expressionState: expression }),
  setBlinking: (blinking) => set({ isBlinking: blinking }),
  setPulsing: (pulsing) => set({ isPulsing: pulsing }),
  
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
