# Red Dot Hiding Feature

This feature automatically removes the browser's red microphone indicator when voice is disabled, while keeping the WebRTC session connected.

## How It Works

1. **Voice ON**: Uses the real microphone track for audio input
2. **Voice OFF**: Swaps to a silent track and releases the microphone hardware
3. **Result**: Browser red dot disappears because no microphone is actively captured

## Configuration

### Enable/Disable the Feature

Edit `src/lib/redDotHidingConfig.ts`:

```typescript
export const RED_DOT_HIDING_ENABLED = true;  // Enable
export const RED_DOT_HIDING_ENABLED = false; // Disable
```

### Quick Toggle

To quickly disable if issues arise:
1. Open `src/lib/redDotHidingConfig.ts`
2. Change `RED_DOT_HIDING_ENABLED` to `false`
3. Save and refresh

## Technical Details

- Uses `RTCRtpSender.replaceTrack()` to swap tracks without renegotiation
- Creates silent audio track using Web Audio API
- Stops microphone track to release hardware
- Keeps WebRTC session alive throughout the process

## Testing

1. **Enable voice**: Red dot should appear
2. **Disable voice**: Red dot should disappear within ~1 second
3. **Re-enable voice**: Red dot should reappear
4. **Check console**: Should see swap messages

## Troubleshooting

If you experience issues:
1. Set `RED_DOT_HIDING_ENABLED = false` to disable
2. Check console for error messages
3. Verify WebRTC session remains connected
4. Test all voice functionality (recording, playback, etc.)

## Files Modified

- `src/hooks/useVoiceDisableEffects.ts` - Main implementation
- `src/lib/redDotHidingConfig.ts` - Configuration
- `src/App.tsx` - Status logging
