import { initializeAudioAnalysis } from './voiceAudioAnalysis';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface AudioElementHandlersOptions {
  setVoiceState: (state: VoiceState) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setSpeechIntensity?: (intensity: number) => void;
}

export const setupAudioElementHandlers = (
  audioEl: HTMLAudioElement, 
  handlers: AudioElementHandlersOptions
) => {
  const { setVoiceState, startSpeaking, stopSpeaking, setSpeechIntensity } = handlers;
  
  // Track audio element state for mouth animation
  let audioPlaying = false;
  let analysisStarted = false;
  let audioDurationTimeout: NodeJS.Timeout | null = null;
  
  // Fallback: ensure analyser is running even if remote_track isn't emitted
  audioEl.addEventListener('playing', async () => {
    console.log('🎵 Audio playing - ensuring analyser is running and mouth animating');
    console.log('🎵 Audio element state during playing:', {
      srcObject: audioEl.srcObject,
      readyState: audioEl.readyState,
      paused: audioEl.paused,
      currentTime: audioEl.currentTime
    });
    audioPlaying = true;
    if (!analysisStarted) {
      console.log('🎵 Starting analysis with MediaElementSource');
      await initializeAudioAnalysis(null, audioEl, {
        audioContextRef: undefined,
        setSpeechIntensity,
        startSpeaking,
        stopSpeaking,
        setVoiceState
      });
    } else {
      console.log('🎵 Analysis already started, skipping');
    }
    // Always trigger speaking state when audio is playing
    if (startSpeaking) {
      startSpeaking();
    } else {
      setVoiceState('speaking');
    }
  });
  
  // Also handle play event
  audioEl.addEventListener('play', () => {
    console.log('🎵 Audio play event - starting mouth animation');
    audioPlaying = true;
    if (startSpeaking) {
      startSpeaking();
    } else {
      setVoiceState('speaking');
    }
  });
  
  // Monitor time updates to ensure mouth stays animated during playback
  audioEl.addEventListener('timeupdate', () => {
    if (audioPlaying && !audioEl.paused && audioEl.currentTime > 0) {
      // Log audio playback progress occasionally
      if (Math.random() < 0.01) {
        console.log(`🎵 Audio playing: time=${audioEl.currentTime.toFixed(2)}s, duration=${audioEl.duration.toFixed(2)}s`);
      }
      
      // Ensure we're in speaking state while audio is playing
      const currentState = (window as any).__currentVoiceState;
      if (currentState !== 'speaking') {
        console.log('⚠️ Audio playing but not in speaking state, fixing...');
        if (startSpeaking) {
          startSpeaking();
        } else {
          setVoiceState('speaking');
        }
      }
    }
  });
  
  // Add duration tracking to know when audio should end
  audioEl.addEventListener('loadedmetadata', () => {
    console.log('🎵 Audio metadata loaded, duration:', audioEl.duration);
    
    // Set a timeout based on audio duration to ensure stopping
    if (audioEl.duration && isFinite(audioEl.duration)) {
      if (audioDurationTimeout) clearTimeout(audioDurationTimeout);
      
      audioDurationTimeout = setTimeout(() => {
        console.log('⏰ Audio duration timeout reached, forcing stop');
        if (stopSpeaking) stopSpeaking();
        setVoiceState('idle');
      }, (audioEl.duration + 1) * 1000); // Add 1 second buffer
    }
  });

  // Clear timeout when audio actually ends
  audioEl.addEventListener('ended', () => {
    console.log('🔇 Audio ended - stopping speech and mouth animation');
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);
    
    // Force stop speaking state
    if (stopSpeaking) {
      stopSpeaking();
    } else {
      setVoiceState('idle');
    }
    
    // Update global state for debugging
    (window as any).__currentVoiceState = 'idle';
    
    // Clear duration timeout
    if (audioDurationTimeout) {
      clearTimeout(audioDurationTimeout);
      audioDurationTimeout = null;
    }
  });

  audioEl.addEventListener('pause', () => {
    console.log('🔇 Audio paused - stopping speech and mouth animation');
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);
    
    if (stopSpeaking) {
      stopSpeaking();
    } else {
      setVoiceState('idle');
    }
    
    (window as any).__currentVoiceState = 'idle';
  });

  audioEl.addEventListener('emptied', () => {
    console.log('🔇 Audio emptied - stopping speech and mouth animation');
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);
    
    if (stopSpeaking) {
      stopSpeaking();
    } else {
      setVoiceState('idle');
    }
    
    (window as any).__currentVoiceState = 'idle';
  });

  // Add error handler to stop animation on audio errors
  audioEl.addEventListener('error', (e) => {
    console.log('❌ Audio error - stopping speech and mouth animation', e);
    audioPlaying = false;
    analysisStarted = false;
    if (setSpeechIntensity) setSpeechIntensity(0);
    if (stopSpeaking) stopSpeaking();
    (window as any).__currentVoiceState = 'idle';
  });
};
