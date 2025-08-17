// static/js/api/config.js - Frontend Configuration Loading

/**
 * Load Google Maps configuration from backend
 */
async function loadGoogleMapsConfig() {
    const { debugLog, errorLog } = window.TravelHelpers;
    const { API_ENDPOINTS } = window.TravelConstants;
    
    debugLog("Loading Google Maps API configuration...");
    
    try {
        const response = await fetch(API_ENDPOINTS.CONFIG);
        
        if (!response.ok) {
            throw new Error(`Config request failed: ${response.status}`);
        }
        
        const config = await response.json();
        debugLog("Config loaded:", config);
        
        return config;
    } catch (error) {
        errorLog('Failed to load config:', error);
        throw error;
    }
}

/**
 * Create Google Maps script URL based on configuration
 */
function createMapsScriptUrl(config) {
    const { debugLog } = window.TravelHelpers;
    let scriptUrl;
    
    if (config.auth_type === "client_id" && config.google_maps_client_id && config.google_maps_client_id.trim()) {
        // Use Client ID authentication
        const clientId = config.google_maps_client_id;
        
        // Validate Client ID format
        if (!clientId.startsWith('gme-') && clientId.length < 20) {
            throw new Error("Invalid Client ID format. Expected format: gme-company or long client ID");
        }
        
        scriptUrl = `https://maps.googleapis.com/maps/api/js?key=${config.google_maps_api_key}&libraries=places,marker,geometry&callback=initializeApp`;
        debugLog("Using Google Maps Client ID authentication");
    } else if (config.google_maps_api_key && config.google_maps_api_key.trim()) {
        // Use API Key authentication
        scriptUrl = `https://maps.googleapis.com/maps/api/js?key=${config.google_maps_api_key}&libraries=places,marker&callback=initializeApp`;        debugLog("Using Google Maps API Key authentication");
    } else {
        throw new Error("No valid Google Maps credentials found. Please check your environment variables.");
    }
    
    return scriptUrl;
}

/**
 * Load Google Maps API script
 */
function loadGoogleMapsScript(scriptUrl) {
    const { debugLog, errorLog } = window.TravelHelpers;
    
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = scriptUrl;
        script.async = true;
        script.defer = true;
        
        script.onload = () => {
            debugLog("Google Maps script loaded successfully");
            resolve();
        };
        
        script.onerror = () => {
            errorLog("Failed to load Google Maps script");
            reject(new Error('Failed to load Google Maps script'));
        };
        
        document.head.appendChild(script);
        debugLog("Google Maps script added to page");
    });
}

// Export for other modules
window.TravelConfig = {
    loadGoogleMapsConfig,
    createMapsScriptUrl,
    loadGoogleMapsScript
};