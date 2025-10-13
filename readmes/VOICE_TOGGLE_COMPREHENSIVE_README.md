# Voice Toggle Functionality - Comprehensive Implementation Guide

## Overview

The Voice Toggle functionality provides users with complete control over the voice interaction system in the Hexa application. This feature allows users to enable or disable voice functionality with a single click, providing both visual and functional feedback about the current state.

## 🎯 Purpose and Use Cases

### Why Voice Toggle?
- **Privacy Control**: Users can disable voice processing when privacy is a concern
- **Resource Management**: Reduces CPU and network usage when voice isn't needed
- **Distraction Reduction**: Prevents accidental voice activations in quiet environments
- **Accessibility**: Provides control for users who prefer text-only interaction
- **Debugging**: Allows developers to isolate voice-related issues

## 🏗️ Architecture Overview

### Core Components

```
┌─────────────────────────────────────────────────────────┐
│                 HexagonContainer.tsx                     │
│  ┌─────────────────────────────────────────────────┐    │
│  │             Toggle Button                       │    │
│  │  • Voice ON/OFF with animated indicator         │    │
│  │  • Positioned above hexagon                     │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │             AnimatedHexagon                     │    │
│  │  • Respects isVoiceDisabled state              │    │
│  │  • Blocks interactions when disabled            │    │
│  │  • Shows visual overlay                         │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│                Animation Store                          │
│  • isVoiceDisabled: boolean state                       │
│  • setVoiceDisabled(): toggle function                  │
│  • Global state management via Zustand                  │
└─────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────┐
│             useVoiceDisableEffects Hook                  │
│  • Blocks microphone access when disabled               │
│  • Mutes audio elements                                 │
│  • Prevents voice processing                            │
│  • Manages session state updates                        │
└─────────────────────────────────────────────────────────┘
```

## 🎨 Visual Implementation

### Toggle Button
Located above the hexagon, the toggle button provides immediate visual feedback:

```tsx
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
    Voice {isVoiceDisabled ? 'OFF' : 'ON'}
  </span>
</motion.button>
```

### Glassy Overlay Effect
When voice is disabled, a beautiful glassy overlay appears over the hexagon:

```tsx
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
```

## 🔧 State Management

### Animation Store Integration

The voice disabled state is managed globally through the animation store:

```tsx
interface AnimationStore {
  // Voice interaction states
  isVoiceDisabled: boolean;
  setVoiceDisabled: (disabled: boolean) => void;

  // Other states...
  voiceState: VoiceState;
  isVoiceActive: boolean;
  isSpeaking: boolean;
  // ...
}
```

### State Flow

```
User Clicks Toggle
        ↓
setVoiceDisabled(!isVoiceDisabled)
        ↓
HexagonContainer re-renders
        ↓
AnimatedHexagon receives new state
        ↓
useVoiceDisableEffects processes side effects
        ↓
Visual overlay appears/disappears
        ↓
Voice functionality enabled/disabled
```

## ⚡ Technical Implementation Details

### Voice Disabling Effects

The `useVoiceDisableEffects` hook handles all the technical side effects:

```tsx
export function useVoiceDisableEffects({
  isVoiceDisabled,
  stopRecording,
  interrupt,
  flushPendingSessionInfo,
}: UseVoiceDisableEffectsOptions) {
  useEffect(() => {
    if (isVoiceDisabled) {
      // 1. Block microphone access
      navigator.mediaDevices.getUserMedia = () => {
        throw new Error('Microphone access blocked - voice is disabled');
      };

      // 2. Stop current recording
      stopRecording();

      // 3. Cancel active responses
      send({ type: 'response.cancel' });

      // 4. Disable session auto-response
      send({
        type: 'session.update',
        session: {
          turn_detection: {
            type: 'server_vad',
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
            create_response: false, // Disable auto-response
          },
        },
      });

      // 5. Mute all audio elements
      muteAllAudio(true);
    } else {
      // Re-enable all functionality
      // ... restoration logic
    }
  }, [isVoiceDisabled]);
}
```

### Integration Points

#### 1. HexagonContainer Component
The main wrapper that provides the toggle interface:

```tsx
export const HexagonContainer: React.FC<HexagonContainerProps> = ({
  size = 300,
  className = '',
  onTranscript,
  onResponse,
  onSendTextAvailable,
  onConnectionChange
}) => {
  const { isVoiceDisabled, setVoiceDisabled, initializationState } = useAnimationStore();

  const toggleVoice = () => {
    setVoiceDisabled(!isVoiceDisabled);
  };

  return (
    <div className={`flex flex-col items-center gap-4 ${className}`}>
      {/* Toggle Button */}
      <motion.button onClick={toggleVoice}>
        {/* Button implementation */}
      </motion.button>

      {/* Hexagon with Overlay */}
      <div className="relative" style={{ width: size, height: size }}>
        <AnimatedHexagon {...props} />

        {/* Glassy Overlay - Only visible when voice is OFF */}
        <AnimatePresence>
          {isVoiceDisabled && (
            <motion.div>
              {/* Overlay implementation */}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
```

#### 2. AnimatedHexagon Integration

The hexagon component respects the disabled state:

```tsx
const handleVoiceToggle = (e: React.MouseEvent) => {
  e.stopPropagation();

  // Prevent interaction if voice is disabled
  if (isVoiceDisabled) {
    console.log('⚠️ Voice interaction blocked - voice is disabled');
    return;
  }

  // Prevent interaction until system is ready
  if (initializationState !== 'ready') {
    console.log('⚠️ Voice interaction blocked - system not ready');
    return;
  }

  // Handle voice interaction
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
};
```

## 🎯 Usage Examples

### Basic Implementation

```tsx
import { HexagonContainer } from './components/HexagonContainer';

function App() {
  return (
    <div className="app-container">
      <HexagonContainer
        size={300}
        onTranscript={(text) => console.log('Transcript:', text)}
        onResponse={(response) => console.log('Response:', response)}
      />
    </div>
  );
}
```

### Custom Styling

```tsx
<HexagonContainer
  size={400}
  className="custom-hexagon-wrapper"
  onTranscript={handleTranscript}
  onResponse={handleResponse}
/>
```

### Programmatic Control

```tsx
import { useAnimationStore } from './store/animationStore';

// Enable voice programmatically
const { setVoiceDisabled } = useAnimationStore();
setVoiceDisabled(false);

// Disable voice programmatically
setVoiceDisabled(true);
```

## 🔍 Advanced Features

### 1. Visual State Indicators

**Voice ON State:**
- ✅ Green pulsing indicator on toggle button
- ✅ Normal hexagon interaction
- ✅ Status shows "Voice: ON"
- ✅ Active voice agent connection

**Voice OFF State:**
- ❌ Disabled icon (🔇) in center of hexagon
- ❌ Glassy overlay with blur effect
- ❌ Status shows "Voice: OFF" in gray
- ❌ Blocked voice interactions

### 2. Animation System

The toggle uses Framer Motion for smooth transitions:

```tsx
// Toggle button animations
whileHover={{ scale: 1.05 }}
whileTap={{ scale: 0.95 }}

// Pulsing indicator
animate={{
  scale: !isVoiceDisabled ? [1, 1.2, 1] : 1,
  opacity: !isVoiceDisabled ? [1, 0.7, 1] : 1
}}
transition={{
  duration: 1,
  repeat: !isVoiceDisabled ? Infinity : 0
}}

// Overlay entrance/exit
initial={{ opacity: 0 }}
animate={{ opacity: 1 }}
exit={{ opacity: 0 }}
transition={{ duration: 0.3 }}
```

### 3. Accessibility Features

- **Keyboard Navigation**: Full keyboard support for the toggle button
- **ARIA Labels**: Proper accessibility labels for screen readers
- **Visual Indicators**: Clear visual states for different interaction modes
- **Tooltips**: Helpful hover text explaining current state

## 🛠️ Development and Debugging

### Global Debug Flags

The system exposes several global variables for debugging:

```javascript
// Check current voice state
window.__currentVoiceState

// Check if voice system is blocked
window.__voiceSystemBlocked

// Manual voice control for testing
window.__setVoiceDisabled = (disabled) => {
  useAnimationStore.getState().setVoiceDisabled(disabled);
}
```

### Console Logging

The system provides detailed logging for troubleshooting:

```javascript
// When voice is disabled
console.log('⚠️ Voice interaction blocked - voice is disabled');
console.log('🔇 Audio buffers disabled - voice processing paused');

// When voice is enabled
console.log('🔄 Voice re-enabled - restoring audio processing');
console.log('✅ Audio buffers re-enabled - voice processing resumed');
```

## 🚨 Troubleshooting

### Common Issues

#### 1. Voice Toggle Not Responding
**Symptoms**: Clicking the toggle button has no effect
**Possible Causes**:
- Animation store not properly initialized
- Component not connected to store
- JavaScript errors preventing state updates

**Solutions**:
```tsx
// Check store connection
const { isVoiceDisabled, setVoiceDisabled } = useAnimationStore();

// Verify toggle function
const toggleVoice = () => {
  console.log('Toggling voice from', isVoiceDisabled, 'to', !isVoiceDisabled);
  setVoiceDisabled(!isVoiceDisabled);
};
```

#### 2. Visual Overlay Not Appearing
**Symptoms**: Voice shows as disabled but overlay doesn't appear
**Possible Causes**:
- CSS not loading properly
- Framer Motion not initialized
- Z-index issues

**Solutions**:
```tsx
// Check if AnimatePresence is working
<AnimatePresence>
  {isVoiceDisabled && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Overlay content */}
    </motion.div>
  )}
</AnimatePresence>
```

#### 3. Microphone Still Accessible When Disabled
**Symptoms**: Voice toggle shows disabled but microphone still works
**Possible Causes**:
- `useVoiceDisableEffects` hook not running
- Browser compatibility issues
- Existing media streams not properly closed

**Solutions**:
```tsx
// Ensure hook is properly connected
useVoiceDisableEffects({
  isVoiceDisabled,
  stopRecording,
  interrupt,
  flushPendingSessionInfo,
});
```

### 4. Performance Issues
**Symptoms**: Animations stutter or system becomes unresponsive
**Possible Causes**:
- Too many animation loops running
- Memory leaks in voice processing
- Heavy CSS effects

**Solutions**:
```tsx
// Optimize animation performance
transition={{
  duration: 0.3,
  ease: "easeInOut"
}}

// Clean up effects properly
useEffect(() => {
  return () => {
    // Cleanup function
  };
}, [isVoiceDisabled]);
```

## 🔄 Integration with Voice Agent System

### Session Management

When voice is disabled, the system sends session updates to the OpenAI Realtime API:

```tsx
// Disable auto-response
send({
  type: 'session.update',
  session: {
    turn_detection: {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
      create_response: false, // Key setting
    },
  },
});

// Re-enable auto-response
send({
  type: 'session.update',
  session: {
    turn_detection: {
      type: 'server_vad',
      threshold: 0.5,
      prefix_padding_ms: 300,
      silence_duration_ms: 500,
      create_response: true, // Re-enable
    },
  },
});
```

### State Synchronization

The voice toggle state is synchronized across all components:

1. **Animation Store** - Central state management
2. **HexagonContainer** - UI state reflection
3. **AnimatedHexagon** - Interaction blocking
4. **Voice Hooks** - Processing control
5. **Session Manager** - API state updates

## 📊 Performance Considerations

### Optimization Techniques

1. **Conditional Rendering**: Only render overlay when needed
2. **Animation Optimization**: Use transform properties for smooth animations
3. **Memory Management**: Clean up event listeners and effects
4. **Bundle Size**: Tree-shake unused animation variants

### Best Practices

```tsx
// Use conditional rendering for performance
{isVoiceDisabled && (
  <ExpensiveOverlayComponent />
)}

// Optimize animation triggers
const shouldAnimate = isVoiceDisabled && initializationState === 'ready';

// Clean up effects
useEffect(() => {
  return () => {
    // Cleanup logic
  };
}, [isVoiceDisabled]);
```

## 🚀 Future Enhancements

### Potential Improvements

1. **Keyboard Shortcuts**: Add spacebar or 'V' key to toggle voice
2. **Persistent State**: Remember user's voice preference across sessions
3. **Customizable Overlays**: Allow users to customize overlay appearance
4. **Sound Effects**: Add audio feedback for toggle actions
5. **Advanced Controls**: Volume control, input device selection
6. **Voice Activity Indicators**: Show when voice is being processed

### Extension Points

The current implementation provides several hooks for extension:

```tsx
// Custom overlay component
const CustomOverlay = ({ isVisible }) => {
  return (
    <motion.div className="custom-voice-overlay">
      {isVisible && <CustomDisabledIcon />}
    </motion.div>
  );
};

// Custom toggle button
const CustomToggleButton = ({ isDisabled, onToggle }) => {
  return (
    <button onClick={onToggle} className="custom-toggle">
      Voice {isDisabled ? 'OFF' : 'ON'}
    </button>
  );
};
```

## 📚 Related Documentation

- [VOICE_AGENTS_README.md](./VOICE_AGENTS_README.md) - Voice agent system overview
- [AUDIO_ANIMATION_SYNC_README.md](./AUDIO_ANIMATION_SYNC_README.md) - Audio animation synchronization
- [Animation Store Documentation](./src/store/animationStore.ts) - State management details

## 🤝 Contributing

To modify or extend the voice toggle functionality:

1. **State Changes**: Modify `animationStore.ts` for new state requirements
2. **Visual Updates**: Update `HexagonContainer.tsx` for UI changes
3. **Side Effects**: Extend `useVoiceDisableEffects.ts` for new behaviors
4. **Integration**: Update `AnimatedHexagon.tsx` for interaction changes

## 📄 Code Examples Repository

For complete working examples, see:
- `src/components/HexagonContainer.tsx` - Main implementation
- `src/store/animationStore.ts` - State management
- `src/hooks/useVoiceDisableEffects.ts` - Side effects
- `src/components/animated/AnimatedHexagon.tsx` - Integration

---

**Note**: This voice toggle system is designed to be completely reversible and non-destructive. All voice functionality can be restored by simply toggling the voice state back to "ON".

For questions or issues, please check the troubleshooting section or examine the console logs for detailed error information.

## Voice Toggle Implementation

This implementation adds a voice toggle functionality to the hexa application with a glassy overlay effect. The feature allows users to enable/disable voice interaction with the animated hexagon.

## Components Added

### 1. HexagonContainer (`src/components/HexagonContainer.tsx`)

A wrapper component that provides:
- **Toggle Button**: Centered above the hexagon with animated indicator
- **Glassy Overlay**: Semi-transparent overlay with blur effect when voice is disabled
- **Status Display**: Shows current voice state below the hexagon
- **Smooth Animations**: All state changes are animated using Framer Motion

### 2. Animation Store Updates (`src/store/animationStore.ts`)

Added new state management:
- `isVoiceDisabled: boolean` - Controls voice functionality
- `setVoiceDisabled(disabled: boolean)` - Toggle function
- `VoiceState` type extended with `'disabled'` state

### 3. AnimatedHexagon Integration (`src/components/animated/AnimatedHexagon.tsx`)

Updated to respect voice disabled state:
- Blocks voice interaction when disabled
- Updates cursor and hover states
- Shows appropriate status icons and colors
- Provides helpful tooltips

## Features

### Visual Behavior

**When Voice is OFF:**
- Glassy, frosted overlay covers the hexagon
- Disabled icon (🔇) appears in the center
- Status shows "Voice: OFF" in gray
- Hexagon is not interactive (cursor changes to not-allowed)
- Subtle pulse effect on the overlay border

**When Voice is ON:**
- Overlay disappears completely
- Status shows "Voice: ON" in green
- Hexagon is fully interactive
- Button shows pulsing indicator
- Normal voice functionality restored

### Technical Details

- **State Management**: Uses Zustand store for global state
- **Animations**: Framer Motion for smooth transitions
- **Styling**: Tailwind CSS with custom glassy effects
- **Accessibility**: Proper ARIA labels and keyboard navigation
- **Integration**: Seamlessly integrates with existing voice system

## Usage

The `HexagonContainer` component automatically wraps the `AnimatedHexagon` and provides the toggle functionality. No additional configuration is required.

```tsx
<HexagonContainer size={300} />
```

## Implementation Notes

- The voice disabled state is stored globally in the animation store
- The overlay uses `backdrop-filter: blur()` for the glassy effect
- All animations respect the user's motion preferences
- The component is fully responsive and accessible
- Voice functionality is completely blocked when disabled (no recording, no processing)

## Future Enhancements

- Add keyboard shortcuts for toggle (e.g., Space key)
- Persist voice state across sessions
- Add sound effects for toggle actions
- Customizable overlay styles
- Voice state indicators in the UI
