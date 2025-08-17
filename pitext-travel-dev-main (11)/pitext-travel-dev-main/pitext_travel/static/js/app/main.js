// static/js/app/main.js - Application entry point

// Global state that was in app.js
window.tripData = null;
window.wsConnected = false;
window.realtimeReady = false;
window.mapReadySent = false;

/**
 * Initialize the application when DOM is ready
 */
document.addEventListener("DOMContentLoaded", () => {
    // This log confirms that our main script is running.
    console.log("DOM fully loaded and parsed");

    // Initialize the application using TravelInitializer
    if (window.TravelInitializer) {
        console.log("✅ TravelInitializer found, initializing...");
        window.TravelInitializer.initialize().catch(error => {
            console.error("❌ TravelInitializer failed:", error);
        });
    } else {
        console.error("❌ TravelInitializer not found.");
        
        // Fallback initialization
        console.log("🔄 Attempting fallback initialization...");
        setTimeout(() => {
            if (window.TravelInitializer) {
                console.log("✅ TravelInitializer found on retry, initializing...");
                window.TravelInitializer.initialize().catch(error => {
                    console.error("❌ TravelInitializer failed on retry:", error);
                });
            } else {
                console.error("❌ TravelInitializer still not found after retry.");
            }
        }, 1000);
    }
});

// Add a global test function
window.testLaunchTrip = function() {
    console.log("🧪 Testing launch trip functionality...");
    
    // Test dependencies
    const deps = {
        travelApp: !!window.TravelApp,
        processItinerary: !!(window.TravelApp && window.TravelApp.processItinerary),
        travelAPI: !!window.TravelAPI,
        travelHelpers: !!window.TravelHelpers,
        travelOverlays: !!window.TravelOverlays,
        travelGoogleMaps: !!window.TravelGoogleMaps,
        mapModulesReady: window.mapModulesReady,
        chatInstance: !!window.chatInstance
    };
    
    console.log("Dependencies:", deps);
    
    // Test direct API call
    fetch('/travel/api/itinerary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ city: 'Paris', days: 3 })
    })
    .then(response => {
        console.log("API response status:", response.status);
        return response.json();
    })
    .then(data => {
        console.log("API response data:", data);
        return "API call successful";
    })
    .catch(error => {
        console.error("API call failed:", error);
        return "API call failed";
    });
    
    return deps;
};