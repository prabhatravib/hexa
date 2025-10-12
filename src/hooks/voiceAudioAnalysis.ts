import { useAnimationStore } from '@/store/animationStore';
import { handleSilenceImmediately } from '@/hooks/useVoiceAnimation';

type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface AudioAnalysisOptions {
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
  setSpeechIntensity?: (intensity: number) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setVoiceState: (state: VoiceState) => void;
}

let analysisStarted = false; // guard so analyser is wired only once
let analysisRafId: number | null = null; // RAF ID for the analysis loop
let cachedMediaElementSource: MediaElementAudioSourceNode | null = null; // Cache source node to avoid "already connected" error

export const initializeAudioAnalysis = async (
  stream: MediaStream | null,
  audioEl: HTMLAudioElement,
  options: AudioAnalysisOptions
) => {
  const { audioContextRef, setSpeechIntensity, startSpeaking, stopSpeaking, setVoiceState } = options;
  
  // Check if voice is disabled before starting audio analysis
  try {
    const disabled = useAnimationStore.getState().isVoiceDisabled;
    if (disabled) {
      console.log('🔇 Voice disabled: blocking audio analysis initialization');
      return;
    }
  } catch (error) {
    console.error('Failed to check voice disabled state:', error);
  }
  
  if (analysisStarted) {
    console.log('🎵 Analysis already started, skipping');
    return;
  }
  
  console.log('🎵 Starting audio analysis...');
  analysisStarted = true;

  // Helper to start analyser using either a MediaStreamSource or MediaElementSource
  const startAnalysisWithNodes = async (
    makeSource: (ctx: AudioContext) => AudioNode
  ) => {
    // Prefer shared AudioContext (resumed on user gesture)
    let ctx: AudioContext;
    if (audioContextRef && audioContextRef.current) {
      ctx = audioContextRef.current;
      try { if (ctx.state === 'suspended') { await ctx.resume(); } } catch {}
    } else {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      if (audioContextRef) audioContextRef.current = ctx;
      if (ctx.state === 'suspended') {
        try { await ctx.resume(); } catch {}
      }
    }

    let srcNode: AudioNode;
    try {
      srcNode = makeSource(ctx);
      console.log('🎵 Created audio source node:', srcNode.constructor.name);
    } catch (error) {
      console.error('❌ Failed to create audio source node:', {
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'Unknown',
        contextState: ctx.state,
        hasPreviousSource: !!(audioContextRef?.current)
      });
      // Clear the flag so future attempts can retry
      analysisStarted = false;
      throw error;
    }
    
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.25;
    srcNode.connect(analyser);
    console.log('🎵 Connected source to analyzer, starting tick loop');

    // Dynamic gate with hysteresis for natural mouth movement
    let noiseFloor = 0.02;
    let speaking = false;
    let level = 0;
    const OPEN_MARGIN = 0.03;
    const CLOSE_MARGIN = 0.015;
    const ATTACK = 0.30;
    const RELEASE = 0.06;

    const tick = () => {
      // Stop only if analysis was explicitly stopped, not based on voice state
      // The analyzer should run as long as audio is playing
      if (!analysisStarted) {
        console.log('🎵 Stopping audio analysis - analysis flag cleared');
        analysisRafId = null;
        analysisStarted = false; // Ensure flag is cleared
        if (setSpeechIntensity) setSpeechIntensity(0);
        useAnimationStore.getState().setVadSpeaking(false);
        return;
      }

      const td = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(td);
      let sum = 0;
      for (let i = 0; i < td.length; i++) {
        const v = (td[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / td.length);
      if (!speaking) noiseFloor = 0.9 * noiseFloor + 0.1 * rms;
      const openThr = noiseFloor + OPEN_MARGIN;
      const closeThr = noiseFloor + CLOSE_MARGIN;
      if (!speaking && rms > openThr) speaking = true;      if (speaking && rms < closeThr) {
        speaking = false;
        handleSilenceImmediately();
      }
      const over = Math.max(0, rms - noiseFloor);
      const norm = Math.min(1, over / (1 - noiseFloor));
      const alpha = speaking ? ATTACK : RELEASE;
      level += alpha * ((speaking ? norm : 0) - level);
      
      // Update VAD flag in store (for potential future use)
      useAnimationStore.getState().setVadSpeaking(speaking);
      
      // Note: VAD flag is tracked but animation is controlled by voiceState
      // The voiceState is driven by OpenAI's agent_start/agent_end events
      
      // Add debugging for analyzer output
      if (process.env.NODE_ENV === 'development' && Math.random() < 0.01) { // Log 1% of the time
        console.log(`🎵 Analyzer: rms=${rms.toFixed(4)}, level=${level.toFixed(4)}, speaking=${speaking}`);
      }
      
      if (setSpeechIntensity) setSpeechIntensity(speaking ? level : 0);
      analysisRafId = requestAnimationFrame(tick);
    };
    
    // Start the analyzer tick loop
    analysisRafId = requestAnimationFrame(tick);
  };

  // If we have a stream, use MediaStreamSource
  if (stream) {
    await startAnalysisWithNodes((ctx) => ctx.createMediaStreamSource(stream));
  } else if (audioEl) {
    // Otherwise use MediaElementSource
    // CRITICAL FIX: Reuse cached source node to avoid "already connected" error
    // Web Audio API only allows one MediaElementSourceNode per audio element per context
    if (cachedMediaElementSource) {
      console.log('🎵 Reusing cached MediaElementSourceNode');
      await startAnalysisWithNodes(() => cachedMediaElementSource!);
    } else {
      console.log('🎵 Creating new MediaElementSourceNode (first time)');
      await startAnalysisWithNodes((ctx) => {
        const source = ctx.createMediaElementSource(audioEl);
        cachedMediaElementSource = source;
        return source;
      });
    }
  }
};

export const stopAudioAnalysis = () => {
  console.log('🎵 Stopping audio analysis...');
  
  // Always clear the flag to allow re-initialization
  analysisStarted = false;
  
  // Cancel any running animation frame
  if (analysisRafId !== null) {
    cancelAnimationFrame(analysisRafId);
    analysisRafId = null;
  }
  
  // Reset mouth animation target to prevent stuck-open mouth (SSR-safe)
  try {
    const store = useAnimationStore.getState();
    if (store.setMouthTarget) {
      store.setMouthTarget(0);
    }
  } catch (error) {
    // Store not available (SSR or unmounted), ignore
  }
};

export const resetAudioAnalysis = () => {
  analysisStarted = false;
  if (analysisRafId !== null) {
    cancelAnimationFrame(analysisRafId);
    analysisRafId = null;
  }
  // Clear cached source node so it can be recreated if needed
  cachedMediaElementSource = null;
};
