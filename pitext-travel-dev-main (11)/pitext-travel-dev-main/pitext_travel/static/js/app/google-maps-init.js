// static/js/app/google-maps-init.js - Google Maps initialization callback

window.initializeApp = function() {
    const { debugLog } = window.TravelHelpers;
    debugLog("🗺️ Google Maps API ready, initializing map components...");
    
    // Initialize the Google Map
    if (window.TravelGoogleMaps && window.TravelGoogleMaps.initializeGoogleMap) {
        window.TravelGoogleMaps.initializeGoogleMap();
    } else {
        console.error('TravelGoogleMaps not loaded');
    }
    
    // Load map modules after map is initialized
    if (window.loadMapModules) {
        window.loadMapModules();
    }
    
    // Fire event to notify other components
    document.dispatchEvent(new CustomEvent('googleMapsReady'));
};