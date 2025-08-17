// static/js/realtime/audio_player.js
// Audio playback for TTS from Realtime API with proper queuing

class AudioPlayer {
    constructor() {
        this.audioContext = null;
        this.isPlaying = false;
        this.audioQueue = [];
        this.currentSource = null;
        
        // Audio settings
        this.sampleRate = 24000;  // OpenAI outputs 24kHz
        this.channelCount = 1;    // Mono
        
        // Callbacks
        this.onPlaybackStart = null;
        this.onPlaybackEnd = null;
        this.onError = null;
        
        // Processing state
        this.isProcessingQueue = false;
        
        console.log('AudioPlayer initialized');
    }
    
    async initialize() {
        try {
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });
            
            // Resume context if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }
            
            console.log('AudioPlayer initialized successfully');
            return true;
            
        } catch (error) {
            console.error('Failed to initialize audio player:', error);
            if (this.onError) {
                this.onError(error);
            }
            return false;
        }
    }
    
    async ensureAudioContextReady() {
        if (!this.audioContext) {
            console.error('AudioContext not initialized');
            return false;
        }
        
        // Ensure audio context is resumed (required for browser autoplay policies)
        if (this.audioContext.state === 'suspended') {
            console.log('🎵 Resuming suspended audio context...');
            try {
                await this.audioContext.resume();
                console.log('🎵 Audio context resumed successfully');
                return true;
            } catch (error) {
                console.error('🎵 Failed to resume audio context:', error);
                return false;
            }
        }
        
        return true;
    }
    
    async playAudioData(audioData) {
        if (!this.audioContext) {
            console.error('AudioContext not initialized');
            return;
        }
        
        // Ensure audio context is ready
        const contextReady = await this.ensureAudioContextReady();
        if (!contextReady) {
            console.error('🎵 Audio context not ready, skipping audio playback');
            return;
        }
        
        try {
            console.log('🎵 AudioPlayer.playAudioData called with:', {
                type: typeof audioData,
                length: audioData ? audioData.length : 'undefined'
            });
            
            // Convert base64 to ArrayBuffer if needed
            let arrayBuffer;
            if (typeof audioData === 'string') {
                console.log('🎵 Converting base64 to ArrayBuffer...');
                arrayBuffer = this._base64ToArrayBuffer(audioData);
                console.log('🎵 Converted to ArrayBuffer, size:', arrayBuffer.byteLength);
            } else {
                console.log('🎵 Using audioData as ArrayBuffer, size:', audioData.byteLength);
                arrayBuffer = audioData;
            }
            
            // Decode PCM16 to Float32
            const pcm16Array = new Int16Array(arrayBuffer);
            console.log('🎵 PCM16 array length:', pcm16Array.length);
            const float32Array = this._pcm16ToFloat32(pcm16Array);
            console.log('🎵 Float32 array length:', float32Array.length);
            
            // Create audio buffer
            const audioBuffer = this.audioContext.createBuffer(
                this.channelCount,
                float32Array.length,
                this.sampleRate
            );
            
            // Copy data to buffer
            audioBuffer.copyToChannel(float32Array, 0);
            
            // Add to queue instead of playing immediately
            this.audioQueue.push(audioBuffer);
            console.log('🎵 Added audio buffer to queue, queue length:', this.audioQueue.length);
            
            // Process queue if not already processing
            if (!this.isProcessingQueue) {
                console.log('🎵 Starting queue processing...');
                this._processQueue();
            }
            
        } catch (error) {
            console.error('Failed to queue audio:', error);
            if (this.onError) {
                this.onError(error);
            }
        }
    }
    
    async _processQueue() {
        if (this.isProcessingQueue || this.audioQueue.length === 0) {
            console.log('🎵 _processQueue: Skipping - processing:', this.isProcessingQueue, 'queue length:', this.audioQueue.length);
            return;
        }
        
        console.log('🎵 _processQueue: Starting to process queue with', this.audioQueue.length, 'buffers');
        this.isProcessingQueue = true;
        
        while (this.audioQueue.length > 0) {
            const audioBuffer = this.audioQueue.shift();
            console.log('🎵 _processQueue: Playing buffer, remaining in queue:', this.audioQueue.length);
            
            try {
                await this._playBuffer(audioBuffer);
                
                // Small gap between chunks to prevent clicks
                await this._wait(5);
                
            } catch (error) {
                console.error('Error playing buffer:', error);
            }
        }
        
        this.isProcessingQueue = false;
        this.isPlaying = false;
        console.log('🎵 _processQueue: Finished processing queue');
        
        // Notify playback end
        if (this.onPlaybackEnd) {
            this.onPlaybackEnd();
        }
    }
    
    _playBuffer(audioBuffer) {
        return new Promise((resolve) => {
            console.log('🎵 _playBuffer: Creating buffer source...');
            
            // Create buffer source
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            
            // Handle end of playback
            source.onended = () => {
                console.log('🎵 _playBuffer: Buffer playback ended');
                this.currentSource = null;
                resolve();
            };
            
            // Start playback tracking
            if (!this.isPlaying) {
                this.isPlaying = true;
                console.log('🎵 _playBuffer: Starting playback tracking');
                if (this.onPlaybackStart) {
                    this.onPlaybackStart();
                }
            }
            
            // Store reference
            this.currentSource = source;
            
            // Start playback immediately
            console.log('🎵 _playBuffer: Starting audio playback...');
            source.start(0);
            console.log('🎵 _playBuffer: Audio playback started');
        });
    }
    
    _wait(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    stop() {
        // Stop current playback
        if (this.currentSource) {
            try {
                this.currentSource.stop();
            } catch (e) {
                // Ignore if already stopped
            }
            this.currentSource = null;
        }
        
        // Clear queue
        this.audioQueue = [];
        this.isProcessingQueue = false;
        this.isPlaying = false;
        
        console.log('Audio playback stopped');
    }
    
    cleanup() {
        // Stop playback
        this.stop();
        
        // Close audio context
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        
        // Clear references
        this.audioContext = null;
        
        console.log('AudioPlayer cleaned up');
    }
    
    _base64ToArrayBuffer(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        return bytes.buffer;
    }
    
    _pcm16ToFloat32(pcm16Array) {
        const float32Array = new Float32Array(pcm16Array.length);
        
        for (let i = 0; i < pcm16Array.length; i++) {
            // Convert Int16 to Float32 (-1 to 1)
            float32Array[i] = pcm16Array[i] / 32768.0;
        }
        
        return float32Array;
    }
    
    isActive() {
        return this.isPlaying || this.audioQueue.length > 0;
    }
    
    getPlaybackState() {
        return {
            isPlaying: this.isPlaying,
            queueLength: this.audioQueue.length,
            isProcessing: this.isProcessingQueue
        };
    }
    
    async prepareForPlayback() {
        // Prepare the audio player for playback by ensuring the audio context is ready
        console.log('🎵 Preparing audio player for playback...');
        return await this.ensureAudioContextReady();
    }
    
    // Test method for debugging
    async testAudioPlayback() {
        console.log('🎵 Testing audio playback...');
        
        // Ensure audio context is ready
        const contextReady = await this.ensureAudioContextReady();
        if (!contextReady) {
            console.error('🎵 Audio context not ready for test');
            return false;
        }
        
        try {
            // Create a simple test tone (440Hz sine wave for 1 second)
            const sampleRate = this.sampleRate;
            const duration = 1; // 1 second
            const frequency = 440; // A4 note
            const samples = sampleRate * duration;
            
            const audioBuffer = this.audioContext.createBuffer(1, samples, sampleRate);
            const channelData = audioBuffer.getChannelData(0);
            
            for (let i = 0; i < samples; i++) {
                channelData[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3;
            }
            
            // Play the test tone
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start(0);
            
            console.log('🎵 Test tone playing (440Hz for 1 second)');
            return true;
            
        } catch (error) {
            console.error('🎵 Test audio playback failed:', error);
            return false;
        }
    }
}

// Export for use in other modules
window.AudioPlayer = AudioPlayer;

// Global test function for debugging
window.testAudioPlayback = async function() {
    console.log('🎵 Global audio test function called');
    
    // Check if we have an audio player instance
    if (window.voiceUI && window.voiceUI.controller && window.voiceUI.controller.audioPlayer) {
        console.log('🎵 Using existing audio player instance');
        return await window.voiceUI.controller.audioPlayer.testAudioPlayback();
    } else {
        console.log('🎵 Creating new audio player instance for test');
        const player = new AudioPlayer();
        await player.initialize();
        const result = await player.testAudioPlayback();
        player.cleanup();
        return result;
    }
};