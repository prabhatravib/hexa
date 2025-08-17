// static/js/ui/voice_ui.js
// Enhanced Voice UI controller with improved map integration

class VoiceUI {
    constructor() {
        // Singleton pattern - prevent multiple instances
        if (VoiceUI.instance) {
            return VoiceUI.instance;
        }
        VoiceUI.instance = this;
        
        this.buttonEl = document.getElementById('voice-button');
        this.statusText = this.buttonEl?.querySelector('.status-text');
        this.controller = null;
        this.isReady = false;
        this.isListening = false;
        
        // State tracking
        this.initialized = false;
        this.initializationPromise = null;
        
        this.isAssistantSpeaking = false;
        this.initializationAttempts = 0;
        this.maxInitAttempts = 3;
        
        console.log('VoiceUI instance created (singleton)');
    }
    
    async initialize() {
        if (this.isReady) return true;
        
        console.log('🎭 Voice UI: Starting initialization...');
        
        // Try multiple times with increasing delays
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                console.log(`🎭 Voice UI: Initialization attempt ${attempt}/5`);
                
                // Wait for Socket.IO if needed
                if (!window.io && window.waitForSocketIO) {
                    console.log('🎭 Voice UI: Waiting for Socket.IO...');
                    try {
                        await window.waitForSocketIO(8000); // Increased timeout
                        console.log('🎭 Voice UI: Socket.IO loaded successfully');
                    } catch (error) {
                        console.error('🎭 Voice UI: Socket.IO failed to load:', error.message);
                        
                        // Run diagnostics on first failure
                        if (attempt === 1 && window.TravelHelpers && window.TravelHelpers.diagnoseSocketIOLoading) {
                            console.log('🔍 Running Socket.IO loading diagnostics...');
                            window.TravelHelpers.diagnoseSocketIOLoading();
                        }
                        
                        // Try manual retry on first failure
                        if (attempt === 1 && window.retrySocketIOLoading) {
                            console.log('🎭 Voice UI: Attempting manual Socket.IO retry...');
                            try {
                                await window.retrySocketIOLoading();
                                console.log('🎭 Voice UI: Socket.IO retry successful');
                            } catch (retryError) {
                                console.error('🎭 Voice UI: Socket.IO retry failed:', retryError.message);
                                throw new Error(`Socket.IO loading failed: ${error.message}`);
                            }
                        } else {
                            throw new Error(`Socket.IO loading failed: ${error.message}`);
                        }
                    }
                }
                
                // Check all dependencies
                if (!this._checkDependencies()) {
                    throw new Error('Required voice components not available');
                }
                
                // Create controller
                this.controller = new window.RealtimeController();
                await this.controller.initialize();
                
                // Set up event handlers
                this.setupEventHandlers();
                
                // Set up click handler
                this.setupClickHandler();
                
                this.isReady = true;
                this.updateStatus('Ready - Click to start voice chat', 'ready');
                console.log('✅ Voice UI initialized successfully');
                return true;
                
            } catch (error) {
                console.error(`❌ Voice UI initialization failed (attempt ${attempt}):`, error);
                
                if (attempt < 5) {
                    const delay = attempt * 1000; // 1s, 2s, 3s, 4s
                    console.log(`🔄 Retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    // Provide more helpful error message
                    let errorMessage = 'Voice unavailable';
                    if (error.message.includes('Socket.IO')) {
                        errorMessage = 'Voice unavailable - Network issue detected';
                    } else if (error.message.includes('microphone')) {
                        errorMessage = 'Voice unavailable - Microphone access required';
                    } else if (error.message.includes('components')) {
                        errorMessage = 'Voice unavailable - Browser not supported';
                    }
                    
                    this.updateStatus(errorMessage, 'error');
                    console.error('❌ Voice UI failed to initialize after 5 attempts');
                    
                    // Show retry button in hexagon interface if available
                    if (window.HexagonInterface && window.HexagonInterface.instance && window.HexagonInterface.instance.showRetryButton) {
                        window.HexagonInterface.instance.showRetryButton();
                    }
                    
                    return false;
                }
            }
        }
    }
    
    _checkDependencies() {
        const required = [
            'RealtimeController',
            'AudioCapture', 
            'AudioPlayer',
            'WebSocketClient',
            'VoiceStateMachine'
        ];
        
        for (const dep of required) {
            if (!window[dep]) {
                console.error(`Missing required dependency: ${dep}`);
                return false;
            }
        }
        
        // Check for WebSocket support
        if (!window.io) {
            console.error('Socket.IO not available');
            return false;
        }
        
        // Check for audio support
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            console.error('Microphone access not supported');
            return false;
        }
        
        return true;
    }
    
    setupClickHandler() {
        if (!this.buttonEl) return;
        
        this.buttonEl.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            if (!this.isReady) {
                console.log('Click ignored - not ready');
                return;
            }
            
            if (this.isAssistantSpeaking) {
                console.log('Click ignored - assistant is speaking');
                return;
            }
            
            await this.toggleListening();
        });
        
        console.log('Click handler set up');
    }
    
    async toggleListening() {
        if (this.isListening) {
            // Stop listening
            console.log('🛑 Stopping voice chat...');
            this.controller.disconnect();
            this.isListening = false;
            this.updateStatus('Ready - Click to start voice chat', 'ready');
            
            // Disable audio capture
            if (this.controller.audioCapture) {
                this.controller.audioCapture.setEnabled(false);
            }
        } else {
            // Start listening
            console.log('🎤 Starting voice chat...');
            this.updateStatus('Connecting to voice service...', 'connecting');
            
            try {
                const connected = await this.controller.connect();
                
                if (connected) {
                    // Prepare audio player for playback
                    if (this.controller.audioPlayer) {
                        console.log('🎵 Preparing audio player for playback...');
                        await this.controller.audioPlayer.prepareForPlayback();
                    }
                    
                    this.isListening = true;
                    this.updateStatus('Listening... Speak naturally!', 'listening');
                    
                    // Enable audio capture
                    if (this.controller.audioCapture) {
                        this.controller.audioCapture.setEnabled(true);
                    }
                    
                    console.log('✅ Voice chat started successfully');
                } else {
                    this.updateStatus('Connection failed - Click to retry', 'error');
                    console.error('❌ Failed to start voice chat');
                }
            } catch (error) {
                console.error('❌ Voice connection error:', error);
                
                // Provide more specific error messages
                let errorMessage = 'Connection failed - Click to retry';
                if (error && error.message) {
                    if (error.message.includes('xhr post error') || error.message.includes('xhr poll error')) {
                        errorMessage = 'Server connection failed - Check network';
                    } else if (error.message.includes('timeout')) {
                        errorMessage = 'Connection timeout - Try again';
                    } else if (error.message.includes('All connection strategies failed')) {
                        errorMessage = 'Network unavailable - Check connection';
                    }
                }
                
                this.updateStatus(errorMessage, 'error');
            }
        }
        
        this.updateButtonState();
    }
    
    setupEventHandlers() {
        // Handle state changes from RealtimeController
        this.controller.on('state_change', (event) => {
            console.log(`🔄 Voice state: ${event.from} → ${event.to}`);
            
            switch (event.to) {
                case 'LISTENING':
                    this.updateStatus('👂 Listening to you...', 'speaking');
                    this.isAssistantSpeaking = false;
                    break;
                    
                case 'PROCESSING':
                    this.updateStatus('🧠 Processing your request...', 'processing');
                    break;
                    
                case 'SPEAKING':
                    this.updateStatus('🗣️ Assistant speaking...', 'assistant-speaking');
                    this.isAssistantSpeaking = true;
                    break;
                    
                case 'WAITING':
                    this.updateStatus('✅ Ready - Speak when ready!', 'listening');
                    this.isAssistantSpeaking = false;
                    
                    // Re-enable audio capture if still listening
                    if (this.controller.audioCapture && this.isListening) {
                        this.controller.audioCapture.setEnabled(true);
                    }
                    break;
            }
            
            this.updateButtonState();
        });
        
        // Handle connection events
        this.controller.on('connected', () => {
            console.log('🔗 Voice service connected');
        });
        
        this.controller.on('ready', () => {
            console.log('✅ Voice session ready');
            this.updateStatus('Listening... Speak naturally!', 'listening');
        });
        
        // Handle transcripts for chat display
        this.controller.on('transcript', (data) => {
            if (window.chatInstance) {
                window.chatInstance.updateTranscript(data);
            }
        });
        
        // Handle itinerary rendering - ENHANCED INTEGRATION
        this.controller.on('render_itinerary', (data) => {
            console.log('🎤 Voice triggered itinerary render:', data);
            
            if (window.TravelApp && data.itinerary) {
                // Debug map readiness
                console.log('🗺️ Map modules ready:', window.mapModulesReady);
                console.log('🗺️ TravelApp available:', !!window.TravelApp);
                console.log('🗺️ TravelApp.renderTripOnMap available:', !!window.TravelApp.renderTripOnMap);
                console.log('🗺️ Itinerary data structure:', data.itinerary);
                
                // Ensure map is ready
                if (window.mapModulesReady) {
                    console.log('🗺️ Map ready, rendering itinerary immediately');
                    window.TravelApp.renderTripOnMap(data.itinerary);
                } else {
                    console.log('🗺️ Map not ready, queuing for later');
                    window.pendingRender = data.itinerary;
                }
                
                // Add success message to chat
                if (window.chatInstance) {
                    const city = data.city || 'your destination';
                    const days = data.days || 'several';
                    window.chatInstance.addBubble('assistant', 
                        `🗺️ I've created your ${days}-day itinerary for ${city}! You can see it on the map.`
                    );
                }
            } else {
                console.error('❌ Missing TravelApp or itinerary data:', {
                    hasTravelApp: !!window.TravelApp,
                    hasItinerary: !!data.itinerary,
                    data: data
                });
            }
        });
        
        // Handle errors
        this.controller.on('error', (error) => {
            console.error('🚫 Voice error:', error);
            
            // Provide more specific error messages
            let errorMessage = 'Voice error - Click to retry';
            if (error && error.message) {
                if (error.message.includes('Session activation timeout')) {
                    errorMessage = 'OpenAI service timeout - Click to retry';
                } else if (error.message.includes('Connection timeout')) {
                    errorMessage = 'Connection timeout - Click to retry';
                } else if (error.message.includes('Session activation failed')) {
                    errorMessage = 'Voice service unavailable - Click to retry';
                }
            }
            
            this.updateStatus(errorMessage, 'error');
            this.isListening = false;
            this.isAssistantSpeaking = false;
            this.updateButtonState();
        });
        
        // Handle disconnection
        this.controller.on('disconnected', () => {
            console.log('🔌 Voice service disconnected');
            this.isListening = false;
            this.isAssistantSpeaking = false;
            this.updateButtonState();
        });
        
        // Handle OpenAI VAD events
        this.controller.on('speech_started', () => {
            console.log('🎤 OpenAI detected speech start');
        });
        
        this.controller.on('speech_stopped', () => {
            console.log('🔇 OpenAI detected speech end');
        });
        
        console.log('Event handlers configured');
    }
    
    updateStatus(text, className) {
        if (this.statusText) {
            this.statusText.textContent = text;
        }
        
        if (this.buttonEl) {
            // Remove all state classes
            this.buttonEl.classList.remove(
                'initializing', 'connecting', 'listening', 
                'speaking', 'processing', 'assistant-speaking', 
                'error', 'ready', 'disabled'
            );
            
            // Add new state class
            if (className) {
                this.buttonEl.classList.add(className);
            }
        }
        
        // Update title attribute
        if (this.buttonEl) {
            this.buttonEl.title = text;
        }
        
        console.log(`🎭 Status: ${text}`);
    }
    
    updateButtonState() {
        if (!this.buttonEl) return;
        
        // Handle disabled state
        if (!this.isReady || this.isAssistantSpeaking) {
            this.buttonEl.classList.add('disabled');
        } else {
            this.buttonEl.classList.remove('disabled');
        }
    }
    
    // Public API methods
    startListening() {
        if (!this.isListening && this.isReady) {
            this.toggleListening();
        }
    }
    
    stopListening() {
        if (this.isListening) {
            this.toggleListening();
        }
    }
    
    getState() {
        return {
            isReady: this.isReady,
            isListening: this.isListening,
            isAssistantSpeaking: this.isAssistantSpeaking,
            initializationAttempts: this.initializationAttempts,
            controller: this.controller ? this.controller.getState() : null
        };
    }
    
    // Force restart if needed
    async restart() {
        console.log('🔄 Restarting voice UI...');
        
        if (this.controller) {
            this.controller.disconnect();
        }
        
        this.isReady = false;
        this.isListening = false;
        this.isAssistantSpeaking = false;
        this.initializationAttempts = 0;
        
        return await this.initialize();
    }
}

// Export for global use
window.VoiceUI = VoiceUI;