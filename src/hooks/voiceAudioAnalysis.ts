type VoiceState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'error';

interface AudioAnalysisOptions {
  audioContextRef?: React.MutableRefObject<AudioContext | null>;
  setSpeechIntensity?: (intensity: number) => void;
  startSpeaking?: () => void;
  stopSpeaking?: () => void;
  setVoiceState: (state: VoiceState) => void;
}

let analysisStarted = false; // guard so analyser is wired only once

export const initializeAudioAnalysis = async (
  stream: MediaStream | null,
  audioEl: HTMLAudioElement,
  options: AudioAnalysisOptions
) => {
  const { audioContextRef, setSpeechIntensity, startSpeaking, stopSpeaking, setVoiceState } = options;
  
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

    const srcNode = makeSource(ctx);
    console.log('🎵 Created audio source node:', srcNode.constructor.name);
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
      if (!speaking && rms > openThr) speaking = true;
      if (speaking && rms < closeThr) speaking = false;
      const over = Math.max(0, rms - noiseFloor);
      const norm = Math.min(1, over / (1 - noiseFloor));
      const alpha = speaking ? ATTACK : RELEASE;
      level += alpha * ((speaking ? norm : 0) - level);
      
      // Add debugging for analyzer output
      if (process.env.NODE_ENV === 'development' && Math.random() < 0.01) { // Log 1% of the time
        console.log(`🎵 Analyzer: rms=${rms.toFixed(4)}, level=${level.toFixed(4)}, speaking=${speaking}`);
      }
      
      if (setSpeechIntensity) setSpeechIntensity(level);
      requestAnimationFrame(tick);
    };
    
    // Start the analyzer tick loop
    tick();
  };

  // If we have a stream, use MediaStreamSource
  if (stream) {
    await startAnalysisWithNodes((ctx) => ctx.createMediaStreamSource(stream));
  } else if (audioEl) {
    // Otherwise use MediaElementSource
    await startAnalysisWithNodes((ctx) => ctx.createMediaElementSource(audioEl));
  }
};

export const resetAudioAnalysis = () => {
  analysisStarted = false;
};
