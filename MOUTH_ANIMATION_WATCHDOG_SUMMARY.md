# Mouth Animation Silence Watchdog Implementation

## Problem
The mouth animation would sometimes stay open after the voice stopped speaking because transport events (from OpenAI) could lag or be delayed. The animation relied solely on these events to know when to stop, creating a poor user experience where the mouth would remain open for several seconds after audio actually ended.

## Solution: Hybrid Approach with Silence Watchdog

We implemented a **silence watchdog** that monitors multiple signals to detect when speech has truly ended, while keeping transport events as the primary (fastest) signal.

### Changes Made

#### 1. Audio Playback State Tracking (`src/store/animationStore.ts`)
- **Added**: `isAudioPlaying: boolean` - Tracks whether the audio element is actively playing
- **Added**: `setAudioPlaying(playing: boolean)` - Setter for the audio playback state

This provides a reliable way to know if audio is actually playing, independent of voice state.

#### 2. Audio Element Integration (`src/hooks/voiceAudioElementManager.ts`)
Updated all audio element event listeners to set the `isAudioPlaying` flag:
- **`playing` event**: Sets `isAudioPlaying = true`
- **`ended` event**: Sets `isAudioPlaying = false`
- **`pause` event**: Sets `isAudioPlaying = false`
- **`emptied` event**: Sets `isAudioPlaying = false`
- **`error` event**: Sets `isAudioPlaying = false`

This ensures the store always has accurate information about audio playback state.

#### 3. Silence Watchdog (`src/hooks/useVoiceAnimation.ts`)
Implemented a watchdog that monitors multiple signals:

**Tracking Meaningful Activity:**
- Mouth openness target > 0.05 (significant mouth movement)
- VAD (Voice Activity Detection) flag is true
- Updates `lastMeaningfulIntensityTimeRef` when either condition is true

**Triggering Conditions:**
- Silence duration ≥ 1000ms (1 second)
- Audio element is not playing (`isAudioPlaying === false`)
- Voice state is still 'speaking' (hasn't been stopped by transport events)

**Failsafe:**
- If silence exceeds 2000ms (2 seconds), stops regardless of audio state
- Prevents stuck-open mouth in edge cases

**Integration:**
- Starts when `voiceState === 'speaking'`
- Stops when voice state changes to anything else
- Checks every 100ms for responsive detection

## How It Works

### Normal Flow (Fast Path)
1. OpenAI sends `agent_end` or `audio_done` transport event
2. Event triggers `stopSpeaking()` immediately
3. Mouth closes within ~200-400ms (spring animation settling time)
4. Watchdog stops since voice state is no longer 'speaking'

### Laggy Transport Events (Watchdog Path)
1. Audio actually ends and audio element fires `ended` event
2. `isAudioPlaying` set to `false`
3. Watchdog detects: silence ≥ 1000ms + audio not playing
4. Watchdog calls `stopSpeaking()` itself
5. Mouth closes within ~200-400ms

### Brief Speech Pauses (No False Positives)
1. Natural pause in speech (e.g., comma, breath)
2. Audio element still playing (`isAudioPlaying === true`)
3. Watchdog sees audio is playing, does NOT trigger
4. Speech resumes, mouth continues animating

## Timing Breakdown

| Scenario | Expected Response Time |
|----------|----------------------|
| Transport event arrives on time | ~200-400ms (just spring settling) |
| Transport event delayed by 500ms | ~500-700ms (watchdog doesn't fire, event arrives first) |
| Transport event delayed by 1500ms+ | ~1000-1200ms (watchdog fires after 1s silence) |
| Natural speech pause (300-600ms) | No closure (audio still playing) |
| Edge case / failsafe | Maximum 2000ms (2s failsafe timeout) |

## Benefits

1. **Fast Response**: Transport events still provide instant stopping when they arrive on time
2. **Reliable Fallback**: Watchdog ensures mouth always stops within 1-2 seconds of true silence
3. **No False Positives**: Won't close during natural speech pauses (checks audio playback state)
4. **Multi-Signal Confidence**: Uses intensity, VAD, audio state, and voice state together
5. **Graceful Degradation**: Works even if one signal fails or is delayed

## Configuration

**Tunable Parameters** (in `useVoiceAnimation.ts`):
```typescript
const SILENCE_TIMEOUT = 1000; // 1 second - primary watchdog trigger
const MEANINGFUL_INTENSITY_THRESHOLD = 0.05; // Mouth openness threshold
// Failsafe triggers at SILENCE_TIMEOUT * 2 (2 seconds)
```

**Watchdog Check Frequency**: 100ms intervals (responsive but not excessive)

## Testing Recommendations

1. **Normal speech**: Verify mouth closes quickly when response ends
2. **Paused speech**: Speak with deliberate pauses, verify mouth stays open during pauses
3. **Network lag**: Simulate slow connection, verify watchdog closes mouth within 1-2s
4. **Long responses**: Test with responses > 30 seconds, verify continuous animation
5. **Interrupted responses**: Stop speaking mid-sentence, verify clean closure

## Future Improvements

1. **Adaptive timeout**: Adjust SILENCE_TIMEOUT based on speaker cadence
2. **Lerp/fade**: Add smooth lerp to 0 over 100ms when watchdog fires (currently uses spring)
3. **Metrics**: Track how often watchdog fires vs transport events (indicates event reliability)

