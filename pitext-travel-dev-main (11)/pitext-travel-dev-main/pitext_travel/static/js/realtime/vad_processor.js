// pitext_travel/static/js/realtime/vad_processor.js
// Fixed version with better speech detection and debugging

class VADProcessor {
    constructor(options = {}) {
        // More conservative VAD configuration
        this.sampleRate = options.sampleRate || 24000;
        this.frameSize = options.frameSize || 20; // ms
        this.vadMode = options.vadMode || 1;
        this.vadThreshold = options.vadThreshold || 0.5;
        
        this.samplesPerFrame = Math.floor(this.sampleRate * this.frameSize / 1000);
        
        // Much more conservative speech detection parameters
        this.speechThreshold = options.speechThreshold || 0.08;  // Much higher threshold
        this.silenceThreshold = options.silenceThreshold || 0.01;
        this.speechPadding = options.speechPadding || 300;
        this.silenceDuration = options.silenceDuration || 1500;  // Much longer silence needed
        
        // State tracking
        this.isSpeaking = false;
        this.silenceStart = null;
        this.speechFrames = 0;
        this.silenceFrames = 0;
        
        // Pre-buffer for capturing audio before speech detection
        this.preBufferSize = Math.ceil(this.speechPadding / this.frameSize);
        this.preBuffer = [];
        
        // Frame buffer for processing
        this.frameBuffer = new Float32Array(this.samplesPerFrame);
        this.frameBufferIndex = 0;
        
        // Callbacks
        this.onSpeechStart = null;
        this.onSpeechEnd = null;
        this.onVoiceActivity = null;
        
        // Energy tracking for adaptive thresholds
        this.energyHistory = [];
        this.maxEnergyHistory = 100;  // Increased history
        this.noiseFloor = 0.01;
        
        // Debouncing and stability - much more conservative
        this.lastSpeechEvent = 0;
        this.lastSilenceEvent = 0;
        this.minEventInterval = 1000; // Increased from 500ms to 1 second
        
        // Debug counters
        this.debug = {
            framesProcessed: 0,
            speechFramesTotal: 0,
            speechEventsTriggered: 0,
            silenceEventsTriggered: 0
        };
        
        console.log('[VADProcessor] Initialized with conservative settings:', {
            sampleRate: this.sampleRate,
            frameSize: this.frameSize,
            samplesPerFrame: this.samplesPerFrame,
            speechThreshold: this.speechThreshold,
            silenceDuration: this.silenceDuration,
            minEventInterval: this.minEventInterval
        });
    }
    
    processAudio(samples) {
        const results = [];
        
        // Process samples frame by frame
        for (let i = 0; i < samples.length; i++) {
            this.frameBuffer[this.frameBufferIndex++] = samples[i];
            
            if (this.frameBufferIndex >= this.samplesPerFrame) {
                const frameResult = this._processFrame(this.frameBuffer);
                results.push(frameResult);
                
                this.frameBufferIndex = 0;
                this.frameBuffer.fill(0);
                this.debug.framesProcessed++;
            }
        }
        
        return {
            frames: results,
            isSpeaking: this.isSpeaking,
            speechFrames: this.speechFrames,
            silenceFrames: this.silenceFrames,
            debug: this.debug
        };
    }
    
    _processFrame(frame) {
        // Calculate frame energy (RMS)
        const energy = this._calculateRMS(frame);
        
        // Update energy history for adaptive threshold
        this._updateEnergyHistory(energy);
        
        // Determine if frame contains speech with higher minimum energy gate
        const hasMinimumEnergy = energy > 0.015;  // Much higher minimum threshold
        const isSpeech = hasMinimumEnergy && this._detectSpeech(energy);
        
        // Create frame data
        const frameData = new Float32Array(frame);
        this._updatePreBuffer(frameData);
        
        // Track speech/silence frames with more conservative logic
        if (isSpeech) {
            this.speechFrames++;
            this.silenceFrames = 0;
            this.silenceStart = null;
            this.debug.speechFramesTotal++;
            
            // Require MANY MORE consecutive speech frames before triggering
            if (!this.isSpeaking && this.speechFrames >= 15) {
                this._handleSpeechStart();
            }
        } else {
            this.silenceFrames++;
            
            if (this.isSpeaking) {
                if (!this.silenceStart) {
                    this.silenceStart = Date.now();
                }
                
                // Require much more silence before ending speech
                const silenceDuration = Date.now() - this.silenceStart;
                if (silenceDuration >= this.silenceDuration && this.silenceFrames >= 15) {
                    this._handleSpeechEnd();
                }
            } else {
                // Gradual decay instead of immediate reset
                this.speechFrames = Math.max(0, this.speechFrames - 1);
            }
        }
        
        // Notify voice activity with throttling
        if (this.onVoiceActivity && this.debug.framesProcessed % 5 === 0) {
            this.onVoiceActivity({
                energy,
                isSpeech,
                isSpeaking: this.isSpeaking,
                timestamp: Date.now(),
                noiseFloor: this.noiseFloor
            });
        }
        
        return {
            frame: frameData,
            energy,
            isSpeech,
            isSpeaking: this.isSpeaking
        };
    }
    
    _calculateRMS(frame) {
        let sum = 0;
        for (let i = 0; i < frame.length; i++) {
            sum += frame[i] * frame[i];
        }
        return Math.sqrt(sum / frame.length);
    }
    
    _detectSpeech(energy) {
        // Use adaptive threshold based on noise floor with more conservative multiplier
        const adaptiveThreshold = Math.max(
            this.speechThreshold,
            this.noiseFloor * 4.0  // Increased from 3.5
        );
        
        // Apply VAD mode with reduced sensitivity
        const modeMultiplier = 1 + (this.vadMode * 0.1);  // Reduced from 0.15
        const threshold = adaptiveThreshold * modeMultiplier;
        
        return energy > threshold;
    }
    
    _updateEnergyHistory(energy) {
        this.energyHistory.push(energy);
        
        if (this.energyHistory.length > this.maxEnergyHistory) {
            this.energyHistory.shift();
        }
        
        // Update noise floor more conservatively
        if (this.energyHistory.length >= 20) {
            const sorted = [...this.energyHistory].sort((a, b) => a - b);
            const percentileIndex = Math.floor(sorted.length * 0.20);  // Increased from 0.15
            this.noiseFloor = Math.max(0.005, sorted[percentileIndex]); // Minimum noise floor
        }
    }
    
    _updatePreBuffer(frameData) {
        const pcm16 = this._float32ToPCM16(frameData);
        this.preBuffer.push(pcm16);
        
        while (this.preBuffer.length > this.preBufferSize) {
            this.preBuffer.shift();
        }
    }
    
    _handleSpeechStart() {
        const now = Date.now();
        
        // More aggressive debouncing
        if (now - this.lastSpeechEvent < this.minEventInterval) {
            console.log('[VAD] Speech start debounced');
            return;
        }
        
        this.isSpeaking = true;
        this.lastSpeechEvent = now;
        this.debug.speechEventsTriggered++;
        
        console.log('[VAD] Speech started (frames:', this.speechFrames, 'energy:', this.energyHistory[this.energyHistory.length - 1]?.toFixed(4), ')');
        
        if (this.onSpeechStart) {
            const preBufferedAudio = this._getPreBufferedAudio();
            this.onSpeechStart({
                timestamp: now,
                preBufferedAudio,
                energy: this.energyHistory[this.energyHistory.length - 1]
            });
        }
    }
    
    _handleSpeechEnd() {
        const now = Date.now();
        
        // More aggressive debouncing
        if (now - this.lastSilenceEvent < this.minEventInterval) {
            console.log('[VAD] Speech end debounced');
            return;
        }
        
        this.isSpeaking = false;
        this.speechFrames = 0;
        this.silenceFrames = 0;
        this.silenceStart = null;
        this.lastSilenceEvent = now;
        this.debug.silenceEventsTriggered++;
        
        console.log('[VAD] Speech ended (silence frames:', this.silenceFrames, ')');
        
        if (this.onSpeechEnd) {
            this.onSpeechEnd({
                timestamp: now
            });
        }
    }
    
    _getPreBufferedAudio() {
        const totalLength = this.preBuffer.reduce((sum, buf) => sum + buf.byteLength, 0);
        const combined = new ArrayBuffer(totalLength);
        const view = new DataView(combined);
        
        let offset = 0;
        for (const buffer of this.preBuffer) {
            const sourceView = new DataView(buffer);
            for (let i = 0; i < buffer.byteLength; i++) {
                view.setUint8(offset + i, sourceView.getUint8(i));
            }
            offset += buffer.byteLength;
        }
        
        return combined;
    }
    
    _float32ToPCM16(float32Array) {
        const buffer = new ArrayBuffer(float32Array.length * 2);
        const view = new DataView(buffer);
        
        let offset = 0;
        for (let i = 0; i < float32Array.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
        
        return buffer;
    }
    
    reset() {
        this.isSpeaking = false;
        this.silenceStart = null;
        this.speechFrames = 0;
        this.silenceFrames = 0;
        this.preBuffer = [];
        this.frameBuffer.fill(0);
        this.frameBufferIndex = 0;
        this.energyHistory = [];
        this.noiseFloor = 0.01;
        this.lastSpeechEvent = 0;
        this.lastSilenceEvent = 0;
        
        // Reset debug counters
        this.debug = {
            framesProcessed: 0,
            speechFramesTotal: 0,
            speechEventsTriggered: 0,
            silenceEventsTriggered: 0
        };
        
        console.log('[VAD] Reset complete');
    }
    
    updateParams(params) {
        let updated = [];
        
        if (params.speechThreshold !== undefined) {
            this.speechThreshold = Math.max(0.01, params.speechThreshold);
            updated.push('speechThreshold');
        }
        if (params.silenceThreshold !== undefined) {
            this.silenceThreshold = params.silenceThreshold;
            updated.push('silenceThreshold');
        }
        if (params.silenceDuration !== undefined) {
            this.silenceDuration = Math.max(200, params.silenceDuration);
            updated.push('silenceDuration');
        }
        if (params.vadMode !== undefined) {
            this.vadMode = Math.max(0, Math.min(3, params.vadMode));
            updated.push('vadMode');
        }
        
        if (updated.length > 0) {
            console.log('[VAD] Parameters updated:', updated.join(', '));
        }
    }
    
    getState() {
        return {
            isSpeaking: this.isSpeaking,
            speechFrames: this.speechFrames,
            silenceFrames: this.silenceFrames,
            noiseFloor: this.noiseFloor,
            preBufferSize: this.preBuffer.length,
            lastSpeechEvent: this.lastSpeechEvent,
            lastSilenceEvent: this.lastSilenceEvent,
            debug: this.debug
        };
    }
    
    getDebugInfo() {
        const recentEnergy = this.energyHistory.slice(-10);
        const avgEnergy = recentEnergy.reduce((a, b) => a + b, 0) / recentEnergy.length;
        
        return {
            config: {
                sampleRate: this.sampleRate,
                frameSize: this.frameSize,
                vadMode: this.vadMode,
                speechThreshold: this.speechThreshold,
                silenceDuration: this.silenceDuration,
                minEventInterval: this.minEventInterval
            },
            state: this.getState(),
            energyStats: {
                historyLength: this.energyHistory.length,
                noiseFloor: this.noiseFloor,
                currentEnergy: this.energyHistory[this.energyHistory.length - 1] || 0,
                averageEnergy: avgEnergy || 0,
                recentPeak: Math.max(...recentEnergy) || 0
            }
        };
    }
}

window.VADProcessor = VADProcessor;