// static/js/realtime/setup.js - Component Setup and Event Wiring
// Extracted from realtime_controller.js to handle component interactions

const RealtimeSetup = {
    /**
     * Set up audio capture component
     */
    setupAudioCapture(controller) {
        // Filtered audio streaming to WebSocket
        controller.audioCapture.onAudioData = (pcm16) => {
            if (controller.wsClient && controller.wsClient.isConnected() && controller.audioCapture.isEnabled) {
                const b64 = this._arrayBufferToBase64(pcm16.buffer);
                controller.wsClient.sendAudioData(b64);
                // Debug: Log audio sending (but limit frequency to avoid spam)
                if (Math.random() < 0.01) { // Log ~1% of audio sends
                    console.log('🎤 Audio sent to WebSocket:', pcm16.buffer.byteLength, 'bytes');
                }
            } else {
                // Debug: Log why audio is not being sent
                if (Math.random() < 0.1) { // Log ~10% of skipped sends
                    const reasons = [];
                    if (!controller.wsClient) reasons.push('no wsClient');
                    if (!controller.wsClient?.isConnected()) reasons.push('not connected');
                    if (!controller.audioCapture.isEnabled) reasons.push('audio disabled');
                    console.log('🎤 Audio NOT sent:', reasons.join(', '));
                }
            }
        };
    },
    
    /**
     * Set up audio player component
     */
    setupAudioPlayer(controller) {
        // Handle playback start
        controller.audioPlayer.onPlaybackStart = (event) => {
            console.log('TTS playback started');
            controller.stateMachine.onResponseStarted(event);
        };
        
        // Handle playback end
        controller.audioPlayer.onPlaybackEnd = (event) => {
            console.log('TTS playback ended');
            controller.stateMachine.onSpeechCompleted(event);
        };
    },
    
    /**
     * Set up state machine component
     */
    setupStateMachine(controller) {
        // State change notifications
        controller.stateMachine.onStateChange = (transition) => {
            console.log(`State: ${transition.from} -> ${transition.to}`);
            controller._trigger('state_change', transition);
        };
        
        // State handlers
        controller.stateMachine.on('onEnterListening', () => {
            // OpenAI is now listening (based on their VAD)
        });
        
        controller.stateMachine.on('onEnterProcessing', () => {
            // OpenAI detected end of speech and is processing
        });
        
        controller.stateMachine.on('onEnterSpeaking', () => {
            // TTS is playing
        });
        
        controller.stateMachine.on('onEnterWaiting', () => {
            // Ready for next interaction
            controller._trigger('ready');
        });
    },
    
    /**
     * Set up WebSocket client component
     */
    setupWebSocket(controller) {
        // Handle connection events
        controller.wsClient.on('session_started', (data) => {
            console.log('Realtime session started:', data);
            controller._trigger('session_started', data);
            
            // Move to waiting state
            controller.stateMachine.forceState('WAITING');
        });
        
        // Handle OpenAI's VAD events
        controller.wsClient.on('speech_started', (data) => {
            console.log('OpenAI VAD: Speech started');
            controller.stateMachine.onSpeechDetected(data);
            controller._trigger('speech_started', data);
        });
        
        controller.wsClient.on('speech_stopped', (data) => {
            console.log('OpenAI VAD: Speech stopped');
            controller.stateMachine.onSpeechEnded(data);
            controller._trigger('speech_stopped', data);
        });
        
        // Handle transcripts
        controller.wsClient.on('transcript', (data) => {
            controller._trigger('transcript', data);
        });
        
        // Handle audio chunks from TTS
        controller.wsClient.on('audio_chunk', (data) => {
            if (data.audio) {
                controller.audioPlayer.playAudioData(data.audio);
            }
        });
        
        // Handle interruption
        controller.wsClient.on('interrupted', (data) => {
            console.log('User interrupted assistant');
            controller.audioPlayer.stop();
            controller._trigger('interrupted', data);
        });
        
        // Handle errors
        controller.wsClient.on('error', (error) => {
            console.error('WebSocket error:', error);
            controller.stateMachine.onProcessingError(error);
            controller._trigger('error', { error });
        });
        
        // Handle custom events (like render_itinerary)
        controller.wsClient.on('render_itinerary', (data) => {
            controller._trigger('render_itinerary', data);
        });
    },
    
    // Utility methods
    
    _arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
};

// Export for use in controller
window.RealtimeSetup = RealtimeSetup;