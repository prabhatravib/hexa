// static/js/ui/hexagon-interface.js - Simple Hexagon Interface Controller

class HexagonInterface {
    constructor() {
        this.container = null;
        this.micButton = null;
        this.cityInput = null;
        this.daysInput = null;
        this.launchButton = null;
        this.voiceController = null;
        this.isListening = false;
        
        console.log('HexagonInterface initialized');
    }
    
    async initialize() {
        // Create the hexagon interface
        this.createInterface();
        
        // Set up event handlers
        this.setupEventHandlers();
        
        // Initialize voice if available - use existing global instance
        if (window.voiceUI) {
            try {
                console.log('🎭 Hexagon: Using existing global VoiceUI instance...');
                this.voiceController = window.voiceUI;
                
                // Override the voice button with our mic button
                this.voiceController.buttonEl = this.micButton;
                this.voiceController.statusText = null; // We don't use status text
                
                // Set up voice event handlers
                this.setupVoiceHandlers();
                console.log('✅ Hexagon: Voice controller initialized successfully');
            } catch (error) {
                console.log('⚠️ Hexagon: Voice controller initialization failed:', error);
                // Voice will be set up later when ready
                this._retryVoiceSetup();
            }
        } else {
            console.log('⚠️ Hexagon: Global VoiceUI not available, will retry later');
            this._retryVoiceSetup();
        }
        
        console.log('HexagonInterface ready');
    }
    
    _retryVoiceSetup() {
        // Retry voice setup after a delay
        setTimeout(async () => {
            if (window.voiceUI && !this.voiceController) {
                try {
                    console.log('🔄 Hexagon: Retrying voice controller setup with global instance...');
                    this.voiceController = window.voiceUI;
                    
                    this.voiceController.buttonEl = this.micButton;
                    this.voiceController.statusText = null;
                    
                    this.setupVoiceHandlers();
                    console.log('✅ Hexagon: Voice controller setup successful on retry');
                } catch (error) {
                    console.log('❌ Hexagon: Voice controller setup failed on retry:', error);
                }
            }
        }, 2000);
    }
    
    createInterface() {
        // Create the hexagon container
        this.container = document.createElement('div');
        this.container.className = 'hexagon-interface';
        this.container.innerHTML = `
            <div class="hexagon-content">
                <div class="hexagon-header">Say or type your trip</div>
                
                <button class="hex-mic-button" id="hex-mic-button">
                    <svg viewBox="0 0 36 36" style="overflow:visible;">
                        <g transform="translate(4, 4)">
                            <path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 1 1-8 0V6a4 4 0 0 1 4-4z"/>
                            <path d="M19 10v1a7 7 0 1 1-14 0v-1h2v1a5 5 0 1 0 10 0v-1h2z"/>
                            <path d="M12 19v4M8 23h8" stroke-width="2" stroke-linecap="round"/>
                        </g>
                    </svg>
                </button>
                
                <div class="hex-inputs">
                    <input type="text" id="hex-city" name="hex-city-input" placeholder="Paris">
                    <input type="number" id="hex-days" name="hex-days-input" placeholder="Days" value="3" min="1" max="14">
                </div>
                
                <button class="hex-launch-button" id="hex-launch">Launch Trip</button>
                
                <!-- Retry button (hidden by default) -->
                <button class="hex-retry-button" id="hex-retry" style="display: none;">
                    🔄 Retry Voice Connection
                </button>
            </div>
        `;
        
        // Add to body
        document.body.appendChild(this.container);
        
        // Get references
        this.micButton = document.getElementById('hex-mic-button');
        this.cityInput = document.getElementById('hex-city');
        this.daysInput = document.getElementById('hex-days');
        this.launchButton = document.getElementById('hex-launch');
        this.retryButton = document.getElementById('hex-retry');
        
        // Give inputs proper IDs for CSS targeting
        this.cityInput.id = "hex-city-input";
        this.daysInput.id = "hex-days-input";
    }
    
    setupEventHandlers() {
        console.log('Setting up event handlers...');
        console.log('micButton:', this.micButton);
        console.log('launchButton:', this.launchButton);
        
        // Mic button click
        this.micButton.addEventListener('click', () => this.toggleVoice());
        
        // Launch button click
        this.launchButton.addEventListener('click', () => this.launchTrip());
        
        // Retry button click
        this.retryButton.addEventListener('click', () => this.retryVoiceConnection());
        
        // Enter key on inputs
        this.cityInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.launchTrip();
        });
        
        this.daysInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.launchTrip();
        });
    }
    
    setupVoiceHandlers() {
        if (!this.voiceController) {
            console.log('🎭 Hexagon: Voice controller not available, will retry later');
            setTimeout(() => this.setupVoiceHandlers(), 1000);
            return;
        }
        
        // Check if controller is available
        if (!this.voiceController.controller) {
            console.log('🎭 Hexagon: Voice controller not ready yet, will setup handlers later');
            // Retry after a short delay
            setTimeout(() => this.setupVoiceHandlers(), 500);
            return;
        }
        
        console.log('🎭 Hexagon: Setting up voice event handlers');
        
        // Handle state changes
        this.voiceController.controller.on('state_change', (event) => {
            console.log(`🎭 Hexagon: Voice state changed: ${event.from} → ${event.to}`);
            switch (event.to) {
                case 'LISTENING':
                    this.setMicState('listening');
                    break;
                    
                case 'PROCESSING':
                    this.setMicState('processing');
                    break;
                    
                case 'SPEAKING':
                    this.setMicState('speaking');
                    break;
                    
                case 'WAITING':
                    this.setMicState('ready');
                    break;
            }
        });
        
        // Handle itinerary generation
        this.voiceController.controller.on('render_itinerary', (data) => {
            console.log('🎭 Hexagon: Received itinerary from voice:', data);
            if (data.city && data.days) {
                this.cityInput.value = data.city;
                this.daysInput.value = data.days;
            }
        });
        
        console.log('✅ Hexagon: Voice event handlers setup complete');
    }
    
    async toggleVoice() {
        console.log('🎤 toggleVoice called');
        console.log('voiceController exists:', !!this.voiceController);
        console.log('voiceController.isReady:', this.voiceController?.isReady);
        
        if (!this.voiceController) {
            console.log('Voice controller not available, retrying setup...');
            this._retryVoiceSetup();
            return;
        }
        
        if (!this.voiceController.isReady) {
            console.log('Voice controller not ready, attempting to initialize...');
            try {
                await this.voiceController.initialize();
                console.log('Voice controller initialized successfully');
            } catch (error) {
                console.error('Failed to initialize voice controller:', error);
                // Show retry button if voice fails
                this.showRetryButton();
                return;
            }
        }
        
        try {
            await this.voiceController.toggleListening();
            this.isListening = this.voiceController.isListening;
            
            if (this.isListening) {
                this.micButton.classList.add('listening');
            } else {
                this.micButton.classList.remove('listening');
            }
        } catch (error) {
            console.error('Failed to toggle voice listening:', error);
            // Show retry button if voice fails
            this.showRetryButton();
        }
    }
    
    setMicState(state) {
        this.micButton.classList.remove('listening', 'processing', 'speaking');
        
        switch (state) {
            case 'listening':
                this.micButton.classList.add('listening');
                break;
            case 'processing':
                this.container.classList.add('processing');
                break;
            case 'speaking':
                this.container.classList.remove('processing');
                break;
            case 'ready':
                this.container.classList.remove('processing');
                break;
        }
    }
    
    async launchTrip() {
        console.log('🚀 launchTrip called');
        const city = this.cityInput.value.trim();
        const days = parseInt(this.daysInput.value, 10);
        
        console.log('City:', city, 'Days:', days);
        
        if (!city || !days || days < 1 || days > 14) {
            // Flash error state
            this.container.style.animation = 'shake 0.3s';
            setTimeout(() => {
                this.container.style.animation = '';
            }, 300);
            return;
        }
        
        console.log('🚀 Launching trip for:', city, days, 'days');
        
        // Show loading state
        this.launchButton.textContent = 'Loading...';
        this.launchButton.disabled = true;
        
        try {
            // Wait for dependencies to be ready
            await this.waitForDependencies();
            
            // Process the itinerary
            if (window.TravelApp && window.TravelApp.processItinerary) {
                await window.TravelApp.processItinerary(city, days);
                console.log('✅ Trip launched successfully');
            } else {
                console.error('❌ TravelApp not available after waiting');
                throw new Error('TravelApp not available');
            }
        } catch (error) {
            console.error('❌ Failed to launch trip:', error);
            
            // Show error in chat if available
            if (window.chatInstance) {
                window.chatInstance.addBubble('assistant', `Sorry, I couldn't create your trip to ${city}. Please try again.`);
            }
            
            // Show error in UI
            this.launchButton.textContent = 'Error - Try Again';
            setTimeout(() => {
                this.launchButton.textContent = 'Launch Trip';
                this.launchButton.disabled = false;
            }, 2000);
            return;
        }
        
        // Reset button state
        this.launchButton.textContent = 'Launch Trip';
        this.launchButton.disabled = false;

        // Show a confirmation message in the chat
        if (window.chatInstance) {
            window.chatInstance.addBubble('assistant', `I've created your ${days}-day itinerary for ${city}! You can see it on the map.`);
        }
    }
    
    async waitForDependencies() {
        console.log('⏳ Waiting for dependencies...');
        
        // Wait for Google Maps to be loaded
        let attempts = 0;
        while (!window.TravelGoogleMaps || !window.TravelGoogleMaps.isMapLoaded()) {
            if (attempts > 50) { // 5 seconds timeout
                throw new Error('Google Maps failed to load within 5 seconds');
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        console.log('✅ Google Maps loaded');
        
        // Wait for map modules to be ready
        attempts = 0;
        while (!window.mapModulesReady) {
            if (attempts > 50) { // 5 seconds timeout
                throw new Error('Map modules failed to load within 5 seconds');
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        console.log('✅ Map modules ready');
        
        // Wait for TravelApp to be available
        attempts = 0;
        while (!window.TravelApp || !window.TravelApp.processItinerary) {
            if (attempts > 50) { // 5 seconds timeout
                throw new Error('TravelApp failed to initialize within 5 seconds');
            }
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        console.log('✅ TravelApp ready');
        
        console.log('✅ All dependencies ready');
    }
    
    async retryVoiceConnection() {
        console.log('🔄 Hexagon: Retrying voice connection...');
        this.retryButton.textContent = '🔄 Retrying...';
        this.retryButton.disabled = true;
        
        try {
            // Try to retry Socket.IO loading
            if (window.retrySocketIOLoading) {
                await window.retrySocketIOLoading();
                console.log('✅ Socket.IO retry successful');
            }
            
            // Use existing global voice controller
            if (window.voiceUI) {
                this.voiceController = window.voiceUI;
                
                this.voiceController.buttonEl = this.micButton;
                this.voiceController.statusText = null;
                
                this.setupVoiceHandlers();
                
                // Hide retry button
                this.retryButton.style.display = 'none';
                
                console.log('✅ Voice connection retry successful');
            }
        } catch (error) {
            console.error('❌ Voice connection retry failed:', error);
            this.retryButton.textContent = '❌ Retry Failed - Click Again';
            this.retryButton.disabled = false;
        }
    }
    
    showRetryButton() {
        this.retryButton.style.display = 'block';
        this.retryButton.textContent = '🔄 Retry Voice Connection';
        this.retryButton.disabled = false;
    }
    
    // Debug function to test dependencies
    testDependencies() {
        console.log('🔍 Testing dependencies...');
        console.log('TravelApp:', !!window.TravelApp);
        console.log('TravelApp.processItinerary:', !!(window.TravelApp && window.TravelApp.processItinerary));
        console.log('TravelAPI:', !!window.TravelAPI);
        console.log('TravelHelpers:', !!window.TravelHelpers);
        console.log('TravelOverlays:', !!window.TravelOverlays);
        console.log('TravelGoogleMaps:', !!window.TravelGoogleMaps);
        console.log('mapModulesReady:', window.mapModulesReady);
        console.log('chatInstance:', !!window.chatInstance);
        
        return {
            travelApp: !!window.TravelApp,
            processItinerary: !!(window.TravelApp && window.TravelApp.processItinerary),
            travelAPI: !!window.TravelAPI,
            travelHelpers: !!window.TravelHelpers,
            travelOverlays: !!window.TravelOverlays,
            travelGoogleMaps: !!window.TravelGoogleMaps,
            mapModulesReady: window.mapModulesReady,
            chatInstance: !!window.chatInstance
        };
    }
}

// Add shake animation
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-10px); }
        75% { transform: translateX(10px); }
    }
`;
document.head.appendChild(shakeStyle);

// Export
window.HexagonInterface = HexagonInterface;

// Create and store global instance
window.HexagonInterface.instance = null;

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (!window.HexagonInterface.instance) {
        window.HexagonInterface.instance = new HexagonInterface();
        window.HexagonInterface.instance.initialize();
    }
}); 