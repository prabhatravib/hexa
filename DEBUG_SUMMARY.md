# Hexa Audio Analyzer Debug Summary

## Problem
The audio is playing but the analyzer isn't attached to it, so no speech intensity values are being generated to drive the mouth animation.

## Debugging Implemented

### 1. Audio Element Monitoring (`voiceAgentService.ts`)
- **Global Debug Variables**: Added `window.__hexaAudioEl` and `window.__currentVoiceState` for easy access
- **Global Debug Function**: Added `window.__hexaDebug()` to log comprehensive debug info
- **Audio Event Monitoring**: Added listeners for all audio events (`loadstart`, `durationchange`, `loadedmetadata`, `canplay`, `canplaythrough`, `play`, `playing`, `pause`, `ended`, `error`)
- **Audio State Logging**: Logs audio element state during key events

### 2. WebRTC Session Debugging (`voiceAgentService.ts`)
- **Session State Logging**: Logs session properties after connection (stream, RTCPeerConnection state, ICE state)
- **Session Event Monitoring**: Monitors all session events (`track`, `stream`, `connectionstatechange`, `iceconnectionstatechange`, `signalingstatechange`)
- **Remote Track Logging**: Enhanced logging for remote track events with track details

### 3. Audio Analyzer Debugging (`voiceAgentService.ts`)
- **Analyzer Start Logging**: Logs when analysis starts and what type of source is created
- **Analyzer Output Logging**: Logs analyzer RMS values and speech detection (1% of the time to avoid spam)
- **Source Node Logging**: Logs the type of audio source node created

### 4. Stream Detection Enhancement (`voiceAgentService.ts`)
- **Aggressive Stream Detection**: Replaced simple timeout with interval-based checking every 500ms
- **Multiple Stream Sources**: Checks audio element srcObject, session stream, and RTCPeerConnection remote streams
- **Fallback Trigger**: Automatically starts synthetic mouth flapping if no stream is found after 10 attempts

### 5. Voice State Debugging (`voiceAgentService.ts`, `animationStore.ts`)
- **Voice State Change Logging**: Logs all voice state transitions with before/after values
- **Function Call Logging**: Logs when `startSpeaking()` and `stopSpeaking()` are called
- **Global State Updates**: Updates `window.__currentVoiceState` on all voice state changes

### 6. Fallback Flap Debugging (`useVoiceInteraction.ts`)
- **Flap Start/Stop Logging**: Logs when fallback flap animation starts and stops
- **Flap Value Logging**: Logs each fallback flap value (can be commented out to reduce spam)
- **Voice State Monitoring**: Logs voice state changes and fallback flap initialization

### 7. Speech Intensity Handler Debugging (`useVoiceInteraction.ts`)
- **Handler Call Logging**: Logs when `handleSpeechIntensity` is called with values
- **Mouth Target Updates**: Logs when mouth targets are updated via the analyzer

### 8. Store Debugging (`animationStore.ts`)
- **Mouth Target Logging**: Logs all calls to `setMouthTarget` with values
- **Store Updates**: Logs when mouth target values are actually set in the store

### 9. Component Debugging (`AnimatedMouth.tsx`)
- **Animation Loop Logging**: Logs when animation loops start/stop
- **Target Change Logging**: Logs when mouth targets change
- **Motion Value Logging**: Logs changes to `currentOpenness`, `springOpenness`, and `gatedOpenness`

### 10. DevPanel Enhancement (`DevPanel.tsx`)
- **Voice Debug Section**: Shows audio element status, srcObject, and playing state
- **Debug Console Button**: Calls `window.__hexaDebug()` for comprehensive logging
- **Manual Test Buttons**: Test buttons for mouth targets and speaking state

## How to Use the Debugging

### 1. Open Browser Console
- Press F12 and go to Console tab
- Look for logs with emojis: 🎵 (audio), 🎤 (voice), 🎯 (mouth), 🔍 (debug)

### 2. Use DevPanel
- Press the gear icon (⚙) on the hexagon to open DevPanel
- Check the Voice Debug section for real-time status
- Use the Debug Console button for comprehensive logging

### 3. Global Debug Functions
```javascript
// In browser console:
window.__hexaDebug()           // Comprehensive debug info
window.__hexaAudioEl          // Audio element reference
window.__currentVoiceState    // Current voice state
```

### 4. Test Manual Controls
- Use "Test Start Speaking" to manually trigger speaking state
- Use "Mouth 0.8" and "Mouth 0.2" to test mouth animation
- Check console for detailed logging of each action

## Expected Debug Output

### When Audio Works:
1. 🎵 Audio element loaded data
2. 🎵 Remote track received (with track details)
3. 🎵 Audio track received, attaching to audio element
4. 🎵 Starting audio analysis...
5. 🎵 Created audio source node: MediaStreamAudioSourceNode
6. 🎵 Connected source to analyzer, starting tick loop
7. 🎵 Analyzer: rms=X.XXXX, level=X.XXXX, speaking=true
8. 🎤 handleSpeechIntensity called with: X.XXX
9. 🎯 setMouthTarget called with: X.XXX
10. 🎯 Setting mouth target to: X.XXX
11. 🎯 Mouth Target Changed: X.XXX

### When Audio Fails (Fallback):
1. ⚠️ Could not find audio stream after 10 attempts
2. 🎯 Starting synthetic mouth flapping as fallback
3. 🎤 Voice state changed to: speaking
4. 🎯 Starting fallback flap animation
5. 🎯 Fallback flap setting mouth target: X.XXX
6. 🎯 setMouthTarget called with: X.XXX
7. 🎯 Setting mouth target to: X.XXX
8. 🎯 Mouth Target Changed: X.XXX

## Key Debug Points

1. **Check if remote_track event fires**: Look for "🎵 Remote track received"
2. **Check if analyzer starts**: Look for "🎵 Starting audio analysis..."
3. **Check if speech intensity is generated**: Look for "🎵 Analyzer: rms=X.XXXX"
4. **Check if fallback flap runs**: Look for "🎯 Fallback flap setting mouth target"
5. **Check if store updates**: Look for "🎯 Setting mouth target to: X.XXX"

## Quick Fixes to Try

1. **Force Speaking State**: Use "Test Start Speaking" button in DevPanel
2. **Manual Mouth Control**: Use "Mouth 0.8" button to test animation
3. **Check Audio Element**: Use `window.__hexaAudioEl` in console
4. **Check Voice State**: Use `window.__currentVoiceState` in console
5. **Run Debug Function**: Use `window.__hexaDebug()` in console

## Next Steps

1. Run the app and check console for debug output
2. Try to trigger voice interaction and watch the logs
3. Use DevPanel to manually test mouth animation
4. Check if fallback flap is working when analyzer fails
5. Look for specific failure points in the audio pipeline
