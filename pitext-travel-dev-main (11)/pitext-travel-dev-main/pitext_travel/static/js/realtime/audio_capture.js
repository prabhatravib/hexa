/* ---------------------------------------------------------------------
   static/js/realtime/audio_capture.js
   Voice-uplink: microphone → down-sample → PCM16 bytes with filtering
--------------------------------------------------------------------- */

// Target codec settings
const TARGET_SAMPLE_RATE = 24_000;
const TARGET_CHANNELS    = 1;

// Audio filtering to reduce feedback - Made less aggressive for better VAD detection
const SILENCE_THRESHOLD = 0.003;  // Reduced from 0.005 for more sensitive speech detection
const MIN_AUDIO_LENGTH = 128;   // Reduced from 256 for faster response

function downsampleTo24kHz(float32, inRate) {
  if (inRate === TARGET_SAMPLE_RATE) return float32;
  const ratio   = inRate / TARGET_SAMPLE_RATE;
  const outLen  = Math.floor(float32.length / ratio);
  const out     = new Float32Array(outLen);
  let  readIdx  = 0;
  for (let i = 0; i < outLen; i++) {
    const next = Math.floor((i + 1) * ratio);
    let   sum = 0;
    let   cnt = 0;
    while (readIdx < next) { sum += float32[readIdx++]; cnt++; }
    out[i] = sum / cnt;
  }
  return out;
}

class AudioCapture {
  constructor() {
    this.stream        = null;
    this.audioContext  = null;
    this.workletNode   = null;
    this.sourceNode    = null;
    this.active        = false;
    this.isEnabled     = false;  // NEW: Control when to actually send audio

    // Audio filtering
    this.audioBuffer   = [];
    this.bufferSize    = 0;
    this.lastSentTime  = 0;
    this.sendInterval  = 25; // Reduced from 50ms to 25ms for lower latency and better VAD response

    this.onAudioData   = null;

    console.log('[AudioCapture] ctor - with audio filtering');
  }

  /* Calculate RMS energy of audio frame */
  _calculateRMS(float32) {
    let sum = 0;
    for (let i = 0; i < float32.length; i++) {
      sum += float32[i] * float32[i];
    }
    return Math.sqrt(sum / float32.length);
  }

  /* Check if audio contains speech */
  _containsSpeech(float32) {
    const energy = this._calculateRMS(float32);
    return energy > SILENCE_THRESHOLD;
  }

  /* Convert Float32 [-1,1] → Int16 (-32768..32767) */
  _float32ToPCM16(float32) {
    const pcm = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      pcm[i]  = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm;
  }

  isActive() { return this.active; }
  
  /* Enable/disable audio sending */
  setEnabled(enabled) {
    this.isEnabled = enabled;
    if (!enabled) {
      this.audioBuffer = [];
      this.bufferSize = 0;
    }
    console.log('[AudioCapture] Audio sending', enabled ? 'ENABLED' : 'DISABLED');
  }

  async initialize() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate:   TARGET_SAMPLE_RATE,
          channelCount: TARGET_CHANNELS,
          echoCancellation:   true,
          noiseSuppression:   true,
          autoGainControl:    true
        }
      });

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: TARGET_SAMPLE_RATE
      });

      console.log('[AudioCapture] AudioContext @', this.audioContext.sampleRate, 'Hz');
      return true;

    } catch (err) {
      console.error('[AudioCapture] init failed:', err);
      throw err;
    }
  }

  async start() {
    if (this.active || !this.stream) return;

    try {
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      
      // Try to use AudioWorkletNode if supported, fallback to ScriptProcessorNode
      if (this.audioContext.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        await this._startWithAudioWorklet();
      } else {
        this._startWithScriptProcessor();
      }

      this.active = true;
      console.log('[AudioCapture] capture STARTED with filtering');
    } catch (error) {
      console.error('[AudioCapture] Failed to start audio processing:', error);
      // Fallback to ScriptProcessorNode if AudioWorklet fails
      this._startWithScriptProcessor();
      this.active = true;
    }
  }

  async _startWithAudioWorklet() {
    // Create a simple audio worklet processor
    const workletCode = `
      class AudioProcessor extends AudioWorkletProcessor {
        constructor() {
          super();
          this.buffer = [];
        }
        
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input && input.length > 0) {
            const channel = input[0];
            if (channel) {
              // Send audio data to main thread
              this.port.postMessage({
                type: 'audioData',
                data: channel.slice()
              });
            }
          }
          return true;
        }
      }
      registerProcessor('audio-processor', AudioProcessor);
    `;

    // Create blob URL for the worklet
    const blob = new Blob([workletCode], { type: 'application/javascript' });
    const workletUrl = URL.createObjectURL(blob);
    
    try {
      await this.audioContext.audioWorklet.addModule(workletUrl);
      this.workletNode = new AudioWorkletNode(this.audioContext, 'audio-processor');
      
      this.workletNode.port.onmessage = (event) => {
        if (event.data.type === 'audioData' && this.isEnabled) {
          this._processAudioData(event.data.data);
        }
      };
      
      this.sourceNode.connect(this.workletNode);
      this.workletNode.connect(this.audioContext.destination);
      
      URL.revokeObjectURL(workletUrl);
    } catch (error) {
      console.warn('[AudioCapture] AudioWorklet failed, falling back to ScriptProcessor:', error);
      URL.revokeObjectURL(workletUrl);
      throw error;
    }
  }

  _startWithScriptProcessor() {
    console.warn('[AudioCapture] Using deprecated ScriptProcessorNode - consider updating your browser');
    
    const BUFFER_SIZE = 1024;
    this.processorNode = this.audioContext.createScriptProcessor(
      BUFFER_SIZE,
      TARGET_CHANNELS,
      TARGET_CHANNELS
    );

    this.processorNode.onaudioprocess = (event) => {
      if (!this.isEnabled) return; // Don't process if disabled

      const inputFloat = event.inputBuffer.getChannelData(0);
      this._processAudioData(inputFloat);
    };

    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.audioContext.destination);
  }

  _processAudioData(inputFloat) {
    // Down-sample if necessary
    const float24 = downsampleTo24kHz(inputFloat, this.audioContext.sampleRate);
    
    // Add to buffer
    this.audioBuffer.push(...float24);
    this.bufferSize += float24.length;

    // Debug: Log audio processing (but limit frequency)
    if (Math.random() < 0.001) { // Log ~0.1% of audio processing
      const energy = this._calculateRMS(float24);
      console.log('[AudioCapture] Processing audio:', {
        inputLength: inputFloat.length,
        downsampledLength: float24.length,
        bufferSize: this.bufferSize,
        energy: energy.toFixed(4),
        hasSpeech: energy > SILENCE_THRESHOLD
      });
    }

    // Send buffered audio periodically
    const now = Date.now();
    if (now - this.lastSentTime > this.sendInterval && this.bufferSize >= MIN_AUDIO_LENGTH) {
      this._sendBufferedAudio();
      this.lastSentTime = now;
    }
  }

  _sendBufferedAudio() {
    if (this.audioBuffer.length === 0 || !this.onAudioData) {
      // Debug: Log why audio is not being sent
      if (Math.random() < 0.1) { // Log ~10% of skipped sends
        const reasons = [];
        if (this.audioBuffer.length === 0) reasons.push('empty buffer');
        if (!this.onAudioData) reasons.push('no callback');
        console.log('[AudioCapture] NOT sending audio:', reasons.join(', '));
      }
      return;
    }

    const float32Array = new Float32Array(this.audioBuffer);
    const pcm16 = this._float32ToPCM16(float32Array);
    
    // Debug: Log audio sending
    /*
    console.log('[AudioCapture] Sending audio buffer:', {
      bufferSize: this.audioBuffer.length,
      pcm16Length: pcm16.length,
      pcm16Bytes: pcm16.buffer.byteLength
    });
    */
   
    // Clear buffer
    this.audioBuffer = [];
    this.bufferSize = 0;

    // Send to backend
    this.onAudioData(pcm16);
  }

  stop() {
    if (!this.active) return;

    // Send any remaining buffered audio
    if (this.audioBuffer.length > 0) {
      this._sendBufferedAudio();
    }

    if (this.workletNode) {
      try { this.workletNode.disconnect(); } catch (_) {}
      this.workletNode = null;
    }
    
    if (this.processorNode) {
      try { this.processorNode.disconnect(); } catch (_) {}
      this.processorNode = null;
    }
    
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (_) {}
      this.sourceNode = null;
    }
    
    this.active = false;
    this.isEnabled = false;
    console.log('[AudioCapture] capture STOPPED');
  }

  cleanup() {
    this.stop();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioContext = null;
    this.stream       = null;
    console.log('[AudioCapture] cleaned up');
  }
}

window.AudioCapture = AudioCapture;