// Animation timing constants (in milliseconds)
export const TIMING = {
  BLINK_DURATION: 150,
  BLINK_MIN_INTERVAL: 2000,
  BLINK_MAX_INTERVAL: 5000,
  
  IDLE_PULSE_DURATION: 3000,
  IDLE_FLOAT_DURATION: 4000,
  IDLE_TIMEOUT: 5000,
  
  HOVER_TRANSITION: 300,
  HOVER_ROTATE_DURATION: 500,
  
  CLICK_BOUNCE_DURATION: 500,
  EXPRESSION_TRANSITION: 300,
  
  GLOW_PULSE_DURATION: 3000,
  RING_PULSE_DURATION: 2500,
};

// Easing functions for smooth animations
export const EASING = {
  SMOOTH: 'easeInOut',
  BOUNCE: [0.68, -0.55, 0.265, 1.55],
  ELASTIC: [0.175, 0.885, 0.32, 1.275],
  SOFT: 'easeOut',
  SNAP: [0.9, 0.1, 0.1, 0.9],
};

// Scale values for different states
export const SCALE = {
  IDLE: 1,
  HOVER: 1.05,
  ACTIVE: 1.1,
  PRESSED: 0.95,
  PULSE_MIN: 0.98,
  PULSE_MAX: 1.02,
};

// Rotation values (in degrees)
export const ROTATION = {
  IDLE: 0,
  HOVER_WIGGLE: [-2, 2, -2, 2, 0],
  ACTIVE_SPIN: 360,
  FLOAT_RANGE: [-1, 1],
};

// Opacity values
export const OPACITY = {
  GLOW_MIN: 0.4,
  GLOW_MAX: 0.9,
  RING_MIN: 0,
  RING_MAX: 0.6,
  EYE_HIGHLIGHT: 0.8,
  BLINK: 0,
};

// Color variations for different states
export const COLORS = {
  PRIMARY: {
    light: '#a7f3d0',
    medium: '#6ee7b7',
    dark: '#059669',
  },
  GLOW: {
    idle: '#6ee7b7',
    hover: '#34d399',
    active: '#10b981',
  },
  EYES: {
    normal: '#064e3b',
    excited: '#042f2e',
    curious: '#065f46',
  },
};

// SVG Path definitions for mouth expressions - SMILE curves
export const MOUTH_PATHS = {
  HAPPY: 'M 82 108 Q 100 128 118 108',      // Smile: control point Y=128 (below endpoints)
  EXCITED: 'M 80 108 Q 100 132 120 108',    // Big smile: control point Y=132
  NEUTRAL: 'M 85 115 L 115 115',            // Straight line (no change needed)
  CURIOUS: 'M 82 108 Q 100 125 118 108',    // Slight smile: control point Y=125
  THINKING: 'M 88 115 Q 100 118 112 115',   // Very slight smile: control point Y=118
  SPEAKING: 'M 85 108 Q 100 125 115 108',   // Speaking smile: control point Y=125
};

// Animation keyframes for complex animations
export const KEYFRAMES = {
  IDLE_FLOAT: {
    y: [0, -3, 0, 3, 0],
    transition: {
      duration: TIMING.IDLE_FLOAT_DURATION / 1000,
      repeat: Infinity,
      ease: EASING.SMOOTH,
    },
  },
  
  PULSE_RING: {
    scale: [0.8, 1.3, 1.3],
    opacity: [0, OPACITY.RING_MAX, 0],
    transition: {
      duration: TIMING.RING_PULSE_DURATION / 1000,
      repeat: Infinity,
      ease: EASING.SOFT,
    },
  },
  
  BOUNCE: {
    scale: [1, SCALE.PRESSED, SCALE.ACTIVE, 1],
    transition: {
      duration: TIMING.CLICK_BOUNCE_DURATION / 1000,
      times: [0, 0.2, 0.5, 1],
      ease: EASING.ELASTIC,
    },
  },
  
  WIGGLE: {
    rotate: ROTATION.HOVER_WIGGLE,
    transition: {
      duration: TIMING.HOVER_ROTATE_DURATION / 1000,
      ease: EASING.SMOOTH,
    },
  },
};

// Expression presets combining multiple properties
export const EXPRESSIONS = {
  HAPPY: {
    mouth: MOUTH_PATHS.HAPPY,
    eyeScale: 1,
    glowIntensity: OPACITY.GLOW_MAX,
  },
  EXCITED: {
    mouth: MOUTH_PATHS.EXCITED,
    eyeScale: 1.1,
    glowIntensity: OPACITY.GLOW_MAX,
  },
  NEUTRAL: {
    mouth: MOUTH_PATHS.NEUTRAL,
    eyeScale: 1,
    glowIntensity: OPACITY.GLOW_MIN,
  },
  CURIOUS: {
    mouth: MOUTH_PATHS.CURIOUS,
    eyeScale: 1.05,
    glowIntensity: (OPACITY.GLOW_MIN + OPACITY.GLOW_MAX) / 2,
  },
};

// Utility function to get random value between min and max
export const randomBetween = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

// Utility function to get random blink interval
export const getRandomBlinkDelay = (): number => {
  return randomBetween(TIMING.BLINK_MIN_INTERVAL, TIMING.BLINK_MAX_INTERVAL);
};
