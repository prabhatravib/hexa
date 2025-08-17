// static/js/ui/voice-initializer.js
// Voice UI initialization

// Global initialization tracking
window.VoiceInitialization = window.VoiceInitialization || {
    initialized: false,
    initializing: false,
    promise: null
};

document.addEventListener('DOMContentLoaded', () => {
    // Prevent multiple initialization attempts
    if (window.VoiceInitialization.initialized || window.VoiceInitialization.initializing) {
        console.log('Voice UI already initialized or in progress, skipping...');
        return;
    }

    if (window.VoiceUI && window.RealtimeController) {
        console.log('Initializing VoiceUI...');
        window.VoiceInitialization.initializing = true;

        // Create a single instance of VoiceUI and make it globally available
        window.voiceUI = new window.VoiceUI();

        window.voiceUI.initialize().then(success => {
            window.VoiceInitialization.initializing = false;
            if (success) {
                // VoiceUI class already logs its own success message, so we don't need to duplicate it here
                window.VoiceInitialization.initialized = true;

                // CRITICAL: Set up integration between voice and map
                if (window.voiceUI.controller) {
                    window.voiceUI.controller.on('render_itinerary', (data) => {
                        console.log('🗺️ Voice triggered map render:', data);
                        // Ensure the coordinator and its render function exist
                        if (data.itinerary && window.TravelApp && window.TravelApp.renderTripOnMap) {
                            window.TravelApp.renderTripOnMap(data.itinerary);
                        }
                    });
                }
            } else {
                console.error('❌ VoiceUI initialization failed.');
            }
        }).catch(err => {
            console.error('Voice initialization promise failed:', err);
            window.VoiceInitialization.initializing = false;
        });
    } else {
        console.warn('VoiceUI or RealtimeController not found. Voice features will be disabled.');
    }
});