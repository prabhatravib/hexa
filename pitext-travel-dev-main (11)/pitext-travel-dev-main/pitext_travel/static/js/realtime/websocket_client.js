// static/js/realtime/websocket_client.js - Simplified & Robust WebSocket Client

class WebSocketClient {
    constructor(namespace = '/travel/ws') {
        this.socket = null;
        this.namespace = namespace;
        this.state = 'disconnected'; // disconnected, connecting, connected, error
        this.eventHandlers = {};
        this.connectionPromise = null;
    }

    connect() {
        if (this.connectionPromise) {
            return this.connectionPromise;
        }

        this.connectionPromise = new Promise((resolve, reject) => {
            if (this.state === 'connected' && this.socket) {
                return resolve({ session_id: this.socket.id, status: 'reconnected' });
            }

            this._updateState('connecting');

            const transportOptions = {
                path: "/socket.io/",
                transports: ["websocket", "polling"], // Prioritize websocket
                reconnection: false, // We handle reconnection logic manually if needed
                timeout: 20000, // Connection timeout
                // Add explicit ping/pong settings to match the server and prevent timeouts
                ping_timeout: 60000, // 60 seconds
                ping_interval: 25000, // 25 seconds
            };

            console.log(`🚀 Connecting to ${this.namespace}...`, transportOptions);
            this.socket = io(this.namespace, transportOptions);

            // Attach all registered event handlers to the new socket
            this._attachEventHandlers();

            const onConnect = () => {
                cleanup();
                console.log(`✅ WebSocket connected: ${this.socket.id}`);
                this._updateState('connected');
                resolve({ session_id: this.socket.id, status: 'connected' });
            };

            const onConnectError = (error) => {
                cleanup();
                console.error(`❌ WebSocket connection error:`, error);
                this._updateState('error', { error: error.message });
                this.connectionPromise = null; // Allow retry
                reject(error);
            };
            
            const onDisconnect = (reason) => {
                cleanup();
                console.warn(`🔌 WebSocket disconnected: ${reason}`);
                this._updateState('disconnected', { reason });
                this.connectionPromise = null; // Allow retry
                // Don't reject here, as disconnects can be normal.
            };

            const cleanup = () => {
                this.socket.off('connect', onConnect);
                this.socket.off('connect_error', onConnectError);
                this.socket.off('disconnect', onDisconnect);
            };

            this.socket.on('connect', onConnect);
            this.socket.on('connect_error', onConnectError);
            this.socket.on('disconnect', onDisconnect);
        });

        return this.connectionPromise;
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
        }
        this._updateState('disconnected');
        this.connectionPromise = null;
    }

    emit(event, data) {
        if (this.state !== 'connected' || !this.socket) {
            console.error(`Cannot emit event '${event}' while not connected.`);
            return;
        }
        this.socket.emit(event, data);
    }

    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
        // If socket exists, attach listener immediately
        if (this.socket) {
            this.socket.on(event, handler);
        }
    }

    off(event, handler) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event] = this.eventHandlers[event].filter(h => h !== handler);
        }
        // If socket exists, detach listener immediately
        if (this.socket) {
            this.socket.off(event, handler);
        }
    }
    
    _attachEventHandlers() {
        // Attach all registered event handlers to the socket
        if (this.socket) {
            Object.keys(this.eventHandlers).forEach(event => {
                this.eventHandlers[event].forEach(handler => {
                    this.socket.on(event, handler);
                });
            });
        }
    }
    
    _trigger(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in ${event} handler:`, error);
                }
            });
        }
    }

    _updateState(newState, data = {}) {
        if (this.state === newState) return;
        this.state = newState;
        console.log(`WebSocketClient state changed to: ${newState}`, data);
        this._trigger('state_change', { state: newState, data: data });
    }

    // --- High-level methods for the controller ---

    startSession() {
        if (this.state !== 'connected') {
            console.error('Cannot start session - not connected');
            this._trigger('error', { 
                message: 'Cannot start session - WebSocket not connected',
                details: 'The WebSocket connection is not established'
            });
            return;
        }
        console.log('🚀 Starting session...');
        this.emit('start_session', {});
    }

    sendAudioData(audioData) {
        if (this.state !== 'connected') {
            console.warn('Cannot send audio - not connected');
            return;
        }
        this.emit('audio_data', { audio: audioData });
    }

    getStats() {
        if (this.state !== 'connected') {
            console.warn('Cannot get stats - not connected');
            return;
        }
        this.emit('get_stats', {});
    }
    
    isConnected() {
        return this.state === 'connected';
    }
}

// Export for use in other modules
window.WebSocketClient = WebSocketClient;