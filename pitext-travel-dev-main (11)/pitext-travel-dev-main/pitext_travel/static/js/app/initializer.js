// static/js/app/initializer.js - Application Initialization Logic
// Extracted from app.js to handle initialization separately

const TravelInitializer = {
    /**
     * Main initialization function
     */
    async initialize() {
        const { debugLog } = window.TravelHelpers;
        
        try {
            // Initialize core UI components
            this.initializeUI();
            
            // Initialize communication (WebSocket for voice or HTTP for text)
            this.initializeCommunication();
            
            // Start loading Google Maps API
            await this.loadGoogleMapsAPI();
            
        } catch (error) {
            console.error("Initialization error:", error);
            if (window.TravelOverlays) {
                window.TravelOverlays.showError(`Initialization failed: ${error.message}`);
            }
        }
    },
    
    /**
     * Initialize UI components
     */
    initializeUI() {
        const { debugLog } = window.TravelHelpers;
        debugLog("Initializing UI components...");
        
        if (window.TravelPanel) {
            window.TravelPanel.initializePanel();
        }
        
        if (window.TravelForm) {
            window.TravelForm.initializeForm();
        }

        // Hexagon Interface initializes itself via DOMContentLoaded
        // Just log that it's available
        if (window.HexagonInterface) {
            debugLog("HexagonInterface available (self-initializing)");
        }
    },
    
    /**
     * Initialize communication (WebSocket for voice or HTTP for text)
     */
    initializeCommunication() {
        const { debugLog } = window.TravelHelpers;
        
        const hasWebSocketSupport = 'WebSocket' in window;
        const hasAudioSupport = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
        
        if (hasWebSocketSupport && hasAudioSupport) {
            debugLog("Browser supports WebSocket and audio - initializing voice chat");
            // Delay WebSocket initialization to ensure Socket.IO is loaded
            setTimeout(() => this.initializeWebSocket(), 500);
        } else {
            debugLog("Using HTTP-based text chat (WebSocket or audio not supported)");
            this.initializeTextChatFallback();
        }
    },
    
    /**
     * Initialize WebSocket connection for Realtime API
     */
    async initializeWebSocket() {
        const { debugLog, errorLog } = window.TravelHelpers;
        
        try {
            // Wait for Socket.IO to load
            if (!window.io && window.waitForSocketIO) {
                debugLog("Waiting for Socket.IO to load...");
                try {
                    await window.waitForSocketIO(10000); // 10 second timeout
                    debugLog("Socket.IO loaded successfully");
                } catch (error) {
                    errorLog("Socket.IO failed to load:", error.message);
                    this.initializeTextChatFallback();
                    return;
                }
            } else if (!window.io) {
                errorLog("Socket.IO not available and no loader found");
                this.initializeTextChatFallback();
                return;
            }
            
            // Wait for RealtimeController to be available
            if (!window.RealtimeController) {
                debugLog("RealtimeController not loaded yet, retrying in 100ms...");
                setTimeout(() => this.initializeWebSocket(), 100);
                return;
            }
            
            debugLog("All dependencies loaded, initializing voice integration");
            
            // Initialize voice UI integration
            if (window.voiceUI && window.voiceUI.controller) {
                this.setupVoiceIntegration(window.voiceUI.controller);
            } else {
                debugLog("Voice UI not ready, will setup integration later");
            }
            
        } catch (error) {
            errorLog("Failed to initialize WebSocket:", error);
            this.initializeTextChatFallback();
        }
    },
    
    /**
     * Set up voice integration with map rendering
     * (Moved from app.js setupVoiceIntegration function)
     */
    setupVoiceIntegration(realtimeController) {
        const { debugLog, errorLog } = window.TravelHelpers;
        
        debugLog("Setting up voice-map integration");
        
        // Event: connected
        realtimeController.on('connected', () => {
            window.wsConnected = true;
            debugLog("WebSocket connected successfully");
        });
        
        // Event: ready for voice
        realtimeController.on('ready', () => {
            window.realtimeReady = true;
            debugLog("Realtime API ready for voice interaction");
            
            // Send map ready status if map is loaded
            if (window.mapModulesReady && realtimeController.wsClient) {
                realtimeController.wsClient.emit('map_ready', {});
            }
        });
        
        // Event: error
        realtimeController.on('error', (err) => {
            errorLog("Realtime error:", err);
            if (err.critical) {
                window.wsConnected = false;
                window.realtimeReady = false;
            }
        });
        
        // Event: itinerary data
        realtimeController.on('render_itinerary', (data) => {
            debugLog("🎤 Voice command generated itinerary:", data);
            
            if (data.itinerary) {
                window.tripData = data.itinerary;
                
                // Force map rendering with retry logic
                const attemptRender = (retries = 0) => {
                    if (window.mapModulesReady && window.TravelGoogleMaps && window.TravelGoogleMaps.isMapLoaded()) {
                        debugLog("🗺️ Map ready, rendering itinerary immediately");
                        
                        // Clear any existing renders first
                        if (window.TravelApp) {
                            window.TravelApp.clearMapElements();
                        }
                        
                        // Render the new itinerary
                        window.TravelApp.renderTripOnMap(data.itinerary);
                        
                        // Update UI to show the map
                        const mapOverlay = document.getElementById('map-overlay');
                        if (mapOverlay) {
                            mapOverlay.style.display = 'none';
                        }
                        
                        // Hide the initial loading message
                        const loadingDiv = document.querySelector('#map .loading');
                        if (loadingDiv) {
                            loadingDiv.style.display = 'none';
                        }
                        
                    } else if (retries < 10) {
                        debugLog(`🗺️ Map not ready (attempt ${retries + 1}), retrying in 500ms...`);
                        setTimeout(() => attemptRender(retries + 1), 500);
                    } else {
                        errorLog("🗺️ Map failed to initialize after 10 attempts");
                        window.TravelOverlays.showError("Map initialization failed. Please refresh the page.");
                    }
                };
                
                // Start render attempts
                attemptRender();
            }
        });
        
        // Handle check_map_ready event
        realtimeController.on('check_map_ready', () => {
            if (window.mapModulesReady && window.TravelGoogleMaps.isMapLoaded() && !window.mapReadySent) {
                realtimeController.wsClient.emit('map_ready', {});
                window.mapReadySent = true;
            }
        });
        
        // Event: transcript for chat display
        realtimeController.on('transcript', (data) => {
            if (window.chatInstance) {
                window.chatInstance.updateTranscript(data);
            }
        });
        
        debugLog("Voice integration setup complete");
        
        // Store reference for external access
        window.TravelApp.setupVoiceIntegration = this.setupVoiceIntegration;
    },
    
    /**
     * Text chat fallback initialization
     */
    initializeTextChatFallback() {
        const { debugLog } = window.TravelHelpers;
        debugLog("Initializing text chat fallback");
        
        // Hide voice button if voice is not available
        const voiceBtn = document.getElementById('voice-button');
        if (voiceBtn) {
            voiceBtn.style.display = 'none';
        }
        
        // Text chat integration would go here
        // This can interface with existing HTTP chat endpoint
    },
    
    /**
     * Load Google Maps API dynamically
     */
    async loadGoogleMapsAPI() {
        const { debugLog, errorLog } = window.TravelHelpers;
        const { showError } = window.TravelOverlays;
        const { loadGoogleMapsConfig, createMapsScriptUrl, loadGoogleMapsScript } = window.TravelConfig;
        
        try {
            debugLog("Loading Google Maps configuration...");
            const config = await loadGoogleMapsConfig();
            
            debugLog("Creating Maps script URL...");
            const scriptUrl = createMapsScriptUrl(config);
            
            debugLog("Loading Google Maps script...");
            await loadGoogleMapsScript(scriptUrl);
            
            debugLog("Google Maps script loaded successfully");
        } catch (error) {
            errorLog("Failed to load Google Maps:", error);
            showError(`Failed to load Google Maps: ${error.message}`);
        }
    }
};

// Export for use in main.js
window.TravelInitializer = TravelInitializer;