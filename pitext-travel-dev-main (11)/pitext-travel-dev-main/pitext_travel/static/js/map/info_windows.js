// static/js/map/info_windows.js - Info Window Management
// Extracted from markers.js to handle info window creation and management

(function() {
    // Check if Google Maps API is loaded
    if (!window.google || !window.google.maps) {
        console.error('Google Maps API not fully loaded yet for info_windows.js - retrying...');
        setTimeout(function() {
            const script = document.createElement('script');
            script.src = '/static/js/map/info_windows.js';
            document.head.appendChild(script);
        }, 100);
        return;
    }

    // Store references to all info windows
    let activeInfoWindows = [];

    /**
     * Create info window content for a stop
     */
    function createInfoWindowContent(stop, day, dayIndex, stopIndex) {
        const dayColor = window.TravelGoogleMaps.getColourForDay(dayIndex + 1);
        const placeTypeDisplay = stop.placeType
            ? stop.placeType.replace(/_/g, ' ')
            : 'attraction';

        return `
            <div class="info-window-content" style="
                background:${dayColor};
                border-radius:8px;
                padding:12px;
                box-shadow:0 2px 6px rgba(0,0,0,0.2);
                min-width:200px;">
                <h4 style="margin:0 0 8px 0;font-size:1.1rem;color:#222;">
                    ${stop.name}
                </h4>
                <p style="margin:4px 0;font-size:0.9rem;color:#444;">
                    ${day.label || `Day ${dayIndex + 1}`} • Stop ${stopIndex + 1} of ${day.stops.length}<br>
                    <small style="text-transform:capitalize;color:#666;">
                        ${placeTypeDisplay}
                    </small>
                </p>
            </div>`;
    }

    /**
     * Create and attach an info window to a marker
     */
    function attachInfoWindow(marker, stop, day, dayIndex, stopIndex) {
        const content = createInfoWindowContent(stop, day, dayIndex, stopIndex);
        
        marker.infoWindow = new google.maps.InfoWindow({
            content: content
        });

        // Track the info window
        activeInfoWindows.push(marker.infoWindow);

        // Add click listener
        marker.addListener('click', () => {
            closeAllInfoWindows();
            marker.infoWindow.open(window.TravelGoogleMaps.getMap(), marker);
        });
    }

    /**
     * Close all open info windows
     */
    function closeAllInfoWindows() {
        activeInfoWindows.forEach(infoWindow => {
            if (infoWindow && infoWindow.close) {
                infoWindow.close();
            }
        });
    }

    /**
     * Clear all info window references
     */
    function clearInfoWindows() {
        closeAllInfoWindows();
        activeInfoWindows = [];
    }

    /**
     * Update info window content for a marker
     */
    function updateInfoWindowContent(marker, newContent) {
        if (marker.infoWindow) {
            marker.infoWindow.setContent(newContent);
        }
    }

    /**
     * Get custom content for special place types
     */
    function getPlaceTypeIcon(placeType) {
        // Map place types to emoji or symbols for info windows
        const iconMap = {
            'museum': '🏛️',
            'restaurant': '🍽️',
            'park': '🌳',
            'shopping': '🛍️',
            'hotel': '🏨',
            'church': '⛪',
            'monument': '🗿',
            'beach': '🏖️',
            'market': '🏪',
            'cafe': '☕'
        };

        return iconMap[placeType] || '📍';
    }

    /**
     * Create enhanced info window content with icons
     */
    function createEnhancedInfoWindowContent(stop, day, dayIndex, stopIndex) {
        const dayColor = window.TravelGoogleMaps.getColourForDay(dayIndex + 1);
        const placeTypeDisplay = stop.placeType
            ? stop.placeType.replace(/_/g, ' ')
            : 'attraction';
        const icon = getPlaceTypeIcon(stop.placeType);

        return `
            <div class="info-window-content" style="
                background:${dayColor};
                border-radius:8px;
                padding:12px;
                box-shadow:0 2px 6px rgba(0,0,0,0.2);
                min-width:200px;">
                <h4 style="margin:0 0 8px 0;font-size:1.1rem;color:#222;display:flex;align-items:center;gap:8px;">
                    <span style="font-size:1.2em;">${icon}</span>
                    ${stop.name}
                </h4>
                <p style="margin:4px 0;font-size:0.9rem;color:#444;">
                    ${day.label || `Day ${dayIndex + 1}`} • Stop ${stopIndex + 1} of ${day.stops.length}<br>
                    <small style="text-transform:capitalize;color:#666;">
                        ${placeTypeDisplay}
                    </small>
                </p>
            </div>`;
    }

    // Export functions for use in markers.js
    window.TravelInfoWindows = {
        createInfoWindowContent,
        attachInfoWindow,
        closeAllInfoWindows,
        clearInfoWindows,
        updateInfoWindowContent,
        getPlaceTypeIcon,
        createEnhancedInfoWindowContent
    };
})();