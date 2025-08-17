// static/js/realtime/controller.js - Simplified Realtime Controller

class RealtimeController {
    constructor() {
        if (RealtimeController.instance) {
            return RealtimeController.instance;
        }
        RealtimeController.instance = this;
        
        this.audioCapture = null;
        this.audioPlayer = null;
        this.stateMachine = null;
        this.wsClient = new window.WebSocketClient(); // Create instance immediately
        
        this.ready = false;
        this.eventHandlers = {};
        
        console.log('RealtimeController instance created');
    }
    
    async initialize() {
        if (this.ready) return true;

        try {
            // Initialize components
            this.audioCapture = new window.AudioCapture();
            this.audioPlayer = new window.AudioPlayer();
            this.stateMachine = new window.VoiceStateMachine();
            
            await this.audioCapture.initialize();
            await this.audioPlayer.initialize();
            
            this._setupComponents();
            
            this.ready = true;
            console.log('✅ RealtimeController initialized successfully');
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize RealtimeController:', error);
            this._trigger('error', { error, critical: true });
            return false;
        }
    }
    
    async connect() {
        if (!this.ready) {
            await this.initialize();
        }
        
        try {
            console.log('🚀 Starting voice connection process...');
            
            const connectionData = await this.wsClient.connect();
            console.log('🎉 WebSocket connection successful:', connectionData);

            await this.audioCapture.start();
            
            await this._startSessionWithTimeout();
            
            return true;
            
        } catch (error) {
            console.error('❌ Failed to connect:', error);
            this._trigger('error', { error });
            return false;
        }
    }
    
    async _startSessionWithTimeout(timeoutMs = 15000) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                errorHandler({ 
                    error: new Error('Session activation timed out. The server did not respond in time.'),
                    type: 'timeout'
                });
            }, timeoutMs);
            
            const sessionHandler = (data) => {
                cleanup();
                console.log('✅ Session activated successfully:', data);
                this._trigger('ready');
                resolve(data);
            };
            
            const errorHandler = (errorData) => {
                cleanup();
                const error = errorData.error || new Error('Session activation failed with an unknown error.');
                const errorType = errorData.type || 'unknown';
                console.error(`❌ Session activation failed (${errorType}):`, error);
                console.error('Error details:', errorData);
                reject(error);
            };

            const cleanup = () => {
                clearTimeout(timeout);
                this.wsClient.off('session_started', sessionHandler);
                this.wsClient.off('error', errorHandler);
            };
            
            this.wsClient.on('session_started', sessionHandler);
            this.wsClient.on('error', errorHandler);
            
            console.log('🚀 Requesting session start...');
            this.wsClient.startSession();
        });
    }
    
    disconnect() {
        if (this.audioCapture) this.audioCapture.stop();
        if (this.audioPlayer) this.audioPlayer.stop();
        if (this.wsClient) this.wsClient.disconnect();
        if (this.stateMachine) this.stateMachine.reset();
        
        this._trigger('disconnected');
        console.log('🔌 RealtimeController disconnected.');
    }
    
    _setupComponents() {
        if (window.RealtimeSetup) {
            window.RealtimeSetup.setupAudioCapture(this);
            window.RealtimeSetup.setupAudioPlayer(this);
            window.RealtimeSetup.setupStateMachine(this);
            window.RealtimeSetup.setupWebSocket(this);
        } else {
            console.error('❌ RealtimeSetup module not loaded');
        }
    }
    
    getState() {
        return {
            ready: this.ready,
            connected: this.wsClient ? this.wsClient.isConnected() : false,
            stateMachine: this.stateMachine ? this.stateMachine.getState() : 'uninitialized',
            audioCapture: this.audioCapture ? this.audioCapture.isActive() : false,
            audioPlayer: this.audioPlayer ? this.audioPlayer.getPlaybackState() : {}
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
            this.eventHandlers[event] = this.eventHandlers[event].filter(
                h => h !== handler
            );
        }
    }
    
    _trigger(event, data) {
        const handlers = this.eventHandlers[event];
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in ${event} handler:`, error);
                }
            });
        }
    }
}

// Export for use in other modules
window.RealtimeController = RealtimeController;