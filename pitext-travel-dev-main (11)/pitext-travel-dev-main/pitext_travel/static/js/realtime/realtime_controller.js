// static/js/realtime/realtime_controller.js
// Main controller that integrates audio capture, playback, and WebSocket communication
// Uses OpenAI's server-side VAD

class RealtimeController {
    constructor() {
        this.state = 'uninitialized'; // uninitialized, initializing, ready, connecting, active, error
        this.wsClient = null;
        this.audioCapture = null;
        this.audioPlayer = null;
        this.eventHandlers = {};

        this._updateState('uninitialized');
    }

    async initialize() {
        if (this.state !== 'uninitialized') return;
        this._updateState('initializing');

        try {
            // 1. Initialize WebSocket Client
            this.wsClient = new WebSocketClient('/travel/ws');
            this._setupWebSocketEventHandlers();
            
            // 2. Initialize Audio Components
            this.audioCapture = new AudioCapture();
            this.audioPlayer = new AudioPlayer();
            await this.audioCapture.initialize();
            await this.audioPlayer.initialize();
            
            // 3. Setup component interactions
            this._setupComponentInteractions();

            this._updateState('ready');
            this._trigger('ready');
            console.log("✅ RealtimeController initialized and ready.");

        } catch (error) {
            console.error("❌ RealtimeController initialization failed:", error);
            this._updateState('error', { error: `Initialization failed: ${error.message}` });
            this._trigger('error', { critical: true, message: error.message });
        }
    }

    async connect() {
        if (this.state !== 'ready') {
            console.warn(`Cannot connect while in state: ${this.state}`);
            return;
        }

        this._updateState('connecting');
        
        try {
            // This promise resolves when the 'connect' event is received from the socket.
            const connectionResult = await this.wsClient.connect();
            console.log("WebSocket connection established:", connectionResult);

            // Now that the WebSocket is connected, start the server-side session.
            this.wsClient.startSession();
            
            // The 'session_started' event from the server will transition us to 'active'.
            
        } catch (error) {
            console.error("❌ Failed to connect WebSocket:", error);
            this._updateState('error', { error: `Connection failed: ${error.message}` });
            this._trigger('error', { critical: true, message: "Could not connect to the server." });
        }
    }

    disconnect() {
        if (this.wsClient) {
            this.wsClient.disconnect();
        }
        if (this.audioCapture && this.audioCapture.isActive()) {
            this.audioCapture.stop();
        }
        if (this.audioPlayer) {
            this.audioPlayer.stop();
        }
        this._updateState('ready'); // Return to a state where we can reconnect
        console.log("🔌 RealtimeController disconnected.");
    }

    _setupWebSocketEventHandlers() {
        if (!this.wsClient) return;

        this.wsClient.on('state_change', ({ state, data }) => {
            console.log(`WebSocket state changed to ${state}`, data);
            // We can add logic here if needed, but for now, the controller manages its own state.
        });

        this.wsClient.on('connected', (data) => {
            this._trigger('connected', data);
        });

        this.wsClient.on('session_started', (data) => {
            console.log("✅ Server session started:", data);
            this._updateState('active');
            this.audioCapture.start(); // Start capturing audio now that the session is active
        });
        
        this.wsClient.on('audio_chunk', (data) => {
            console.log('🎵 Received audio_chunk event:', data);
            if (this.audioPlayer && data.audio) {
                console.log('🎵 Playing audio chunk, size:', data.audio.length);
                this.audioPlayer.playAudioData(data.audio);
            } else {
                console.warn('🎵 Audio chunk received but no audio data or player:', {
                    hasAudioPlayer: !!this.audioPlayer,
                    hasAudioData: !!data.audio,
                    data: data
                });
            }
        });

        this.wsClient.on('transcript', (data) => {
            this._trigger('transcript', data);
        });
        
        this.wsClient.on('render_itinerary', (data) => {
            this._trigger('render_itinerary', data);
        });

        this.wsClient.on('error', (error) => {
            console.error("Server-side error:", error);
            this._updateState('error', { error: error.message });
            this._trigger('error', { critical: false, message: error.message });
        });
    }

    _setupComponentInteractions() {
        // When audio capture has data, send it via WebSocket
        this.audioCapture.onAudioData = (audioData) => {
            if (this.state === 'active' && this.wsClient) {
                const b64 = this._arrayBufferToBase64(audioData);
                this.wsClient.sendAudioData(b64);
            }
        };

        // When the audio player starts/stops, notify the controller
        this.audioPlayer.onStateChange = (state) => {
            this._trigger('player_state', state);
        };
    }

    getState() {
        return {
            controller: this.state,
            websocket: this.wsClient ? this.wsClient.state : 'uninitialized',
            capture: this.audioCapture ? this.audioCapture.isActive() : false,
            player: this.audioPlayer ? this.audioPlayer.getPlaybackState() : 'idle',
        };
    }

    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }

    off(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
        }
    }

    _trigger(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => handler(data));
        }
    }

    _updateState(newState, data = {}) {
        if (this.state === newState) return;
        this.state = newState;
        console.log(`RealtimeController state changed to: ${newState}`, data);
        this._trigger('state_change', { state: newState, data: data });
    }

    _arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    // Test method for debugging audio generation
    async testAudioGeneration() {
        console.log('🧪 Testing audio generation...');
        
        try {
            const response = await fetch('/travel/test-audio-generation');
            const data = await response.json();
            
            if (data.status === 'success') {
                console.log('🧪 Audio generation test triggered:', data);
                return true;
            } else {
                console.error('🧪 Audio generation test failed:', data);
                return false;
            }
        } catch (error) {
            console.error('🧪 Audio generation test error:', error);
            return false;
        }
    }
}

// Export for use in other modules
window.RealtimeController = RealtimeController;

// Global test function for debugging audio chunks
window.testAudioChunk = async function() {
    console.log('🎵 Testing audio chunk processing...');
    
    if (window.voiceUI && window.voiceUI.controller) {
        const controller = window.voiceUI.controller;
        
        // Create a test audio chunk (1 second of silence at 24kHz)
        const sampleRate = 24000;
        const duration = 1; // 1 second
        const samples = sampleRate * duration;
        
        // Create PCM16 data (silence = all zeros)
        const pcm16Data = new Int16Array(samples);
        
        // Convert to base64
        const buffer = pcm16Data.buffer;
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64Audio = btoa(binary);
        
        // Simulate receiving an audio chunk event
        console.log('🎵 Simulating audio_chunk event with', samples, 'samples');
        controller.wsClient._trigger('audio_chunk', {
            audio: base64Audio,
            item_id: 'test-item'
        });
        
        return true;
    } else {
        console.error('🎵 No voice UI controller available for test');
        return false;
    }
};

// Global test function for debugging audio generation
window.testAudioGeneration = async function() {
    console.log('🧪 Global audio generation test called');
    
    if (window.voiceUI && window.voiceUI.controller) {
        console.log('🧪 Using existing controller for test');
        return await window.voiceUI.controller.testAudioGeneration();
    } else {
        console.error('🧪 No voice UI controller available for test');
        return false;
    }
};