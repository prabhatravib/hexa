// static/js/map/renderer.js - Map Rendering Coordinator
// Extracted from app.js and google-maps.js to coordinate map rendering

const MapRenderer = {
    /**
     * Initialize map rendering when modules are ready
     */
    initialize() {
        const { debugLog } = window.TravelHelpers;
        
        // Check if we have pending render from voice or other sources
        if (window.pendingRender) {
            debugLog("Found pending render, executing now...");
            this.renderItinerary(window.pendingRender);
            window.pendingRender = null;
        }
        
        debugLog("Map renderer initialized");
    },
    
    /**
     * Main rendering function for itineraries
     * Delegates to specific modules for markers, routes, and controls
     */
    renderItinerary(data) {
        const { debugLog, errorLog } = window.TravelHelpers;
        const { showError } = window.TravelOverlays;
        const { fitMapToBounds } = window.TravelGoogleMaps;
        
        if (!data || !data.days || data.days.length === 0) {
            errorLog("Invalid itinerary data:", data);
            showError("No itinerary data to display");
            return;
        }
        
        // Check if map modules are ready
        if (!window.mapModulesReady) {
            debugLog("Map modules not ready, storing for later render...");
            window.pendingRender = data;
            return;
        }
        
        // Check if required modules exist
        if (!window.TravelMarkers || !window.TravelRoutes || !window.TravelControls) {
            errorLog("Required map modules not loaded");
            showError("Map modules not loaded properly");
            return;
        }
        
        debugLog("🗺️ Rendering trip on map with", data.days.length, "days");
        
        try {
            // Clear existing elements
            this.clearAll();
            
            // Create markers and get bounds
            const { bounds, totalStops } = window.TravelMarkers.createAllMarkers(data);
            debugLog("Created markers for", totalStops, "total stops");
            
            // Create routes
            window.TravelRoutes.createAllRoutes(data);
            debugLog("Created routes for all days");
            
            // Show only the first day initially
            this.showDay(0, data.days.length);
            
            // Fit map to bounds
            fitMapToBounds(bounds, totalStops);
            
            // Render day controls
            window.TravelControls.renderDayControls(data.days);
            
            debugLog("✅ Trip rendering complete!");
            
            // Update UI state
            this.updateUIState(true);
            
            // Reset map ready flag for next rendering
            window.mapReadySent = false;
            
        } catch (error) {
            errorLog("Error rendering trip:", error);
            showError(`Failed to render trip: ${error.message}`);
        }
    },
    
    /**
     * Clear all map elements
     */
    clearAll() {
        if (window.TravelMarkers) window.TravelMarkers.clearAllMarkers();
        if (window.TravelRoutes) window.TravelRoutes.clearAllRoutes();
        if (window.TravelControls) window.TravelControls.clearDayControls();
    },
    
    /**
     * Show a specific day and hide others
     */
    showDay(dayIndex, totalDays) {
        // Hide all days
        for (let i = 0; i < totalDays; i++) {
            if (window.TravelMarkers) {
                window.TravelMarkers.toggleMarkersForDay(i, false);
            }
            if (window.TravelRoutes) {
                window.TravelRoutes.toggleRoutesForDay(i, false);
            }
        }
        
        // Show the selected day
        if (window.TravelMarkers) {
            window.TravelMarkers.toggleMarkersForDay(dayIndex, true);
        }
        if (window.TravelRoutes) {
            window.TravelRoutes.toggleRoutesForDay(dayIndex, true);
        }

        // --- Orient the map to the selected day's route ---
        if (window.TravelApp && window.TravelApp.currentTripData) {
            const days = window.TravelApp.currentTripData.days;
            if (days && days[dayIndex] && Array.isArray(days[dayIndex].stops)) {
                window.TravelRoutes.orientMapToDay(days[dayIndex].stops);
            }
        }
    },
    
    /**
     * Update UI state after rendering
     */
    updateUIState(success) {
        // Hide map overlay
        const mapOverlay = document.getElementById('map-overlay');
        if (mapOverlay) {
            mapOverlay.style.display = success ? 'none' : 'block';
        }
        
        // Hide loading message
        const loadingDiv = document.querySelector('#map .loading');
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        }
    },
    
    /**
     * Check if rendering is possible
     */
    canRender() {
        return window.mapModulesReady && 
               window.TravelGoogleMaps && 
               window.TravelGoogleMaps.isMapLoaded();
    }
};

// Export for use in other modules
window.TravelMapRenderer = MapRenderer;