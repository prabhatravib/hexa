// static/js/map/route_fallback.js - Fallback Route Handling
// Extracted from routes.js to handle polyline fallbacks

(function() {
    // Check if Google Maps API is loaded
    if (!window.google || !window.google.maps) {
        console.error('Google Maps API not fully loaded yet for route_fallback.js - retrying...');
        setTimeout(function() {
            const script = document.createElement('script');
            script.src = '/static/js/map/route_fallback.js';
            document.head.appendChild(script);
        }, 100);
        return;
    }

    /**
     * Create a simple polyline when Directions API fails
     */
    function createSimplePolyline(stops, dayIndex) {
        const { debugLog, createLatLng } = window.TravelHelpers;
        const { getMap, getColourForDay } = window.TravelGoogleMaps;
        const { isDayVisible } = window.TravelControls;

        debugLog(`Drawing fallback polyline for Day ${dayIndex + 1}`);

        const pathCoords = stops.map(s => createLatLng(s.lat, s.lng));
        const routeColour = getColourForDay(dayIndex + 1);
        const map = getMap();

        const polyline = new google.maps.Polyline({
            path: pathCoords,
            geodesic: true,
            strokeColor: "#2196f3",
            strokeOpacity: 0.9,
            strokeWeight: 3
        });

        polyline.dayIndex = dayIndex;
        polyline.setMap(isDayVisible(dayIndex) ? map : null);

        return polyline;
    }

    /**
     * Create curved polyline for better visual appeal
     */
    function createCurvedPolyline(stops, dayIndex) {
        const { debugLog, createLatLng } = window.TravelHelpers;
        const { getMap, getColourForDay } = window.TravelGoogleMaps;
        const { isDayVisible } = window.TravelControls;

        debugLog(`Drawing curved fallback polyline for Day ${dayIndex + 1}`);

        // Create curved path using bezier-like interpolation
        const pathCoords = [];
        
        for (let i = 0; i < stops.length - 1; i++) {
            const start = createLatLng(stops[i].lat, stops[i].lng);
            const end = createLatLng(stops[i + 1].lat, stops[i + 1].lng);
            
            // Add start point
            pathCoords.push(start);
            
            // Add intermediate curved points
            const steps = 10;
            for (let j = 1; j < steps; j++) {
                const t = j / steps;
                const lat = start.lat + (end.lat - start.lat) * t;
                const lng = start.lng + (end.lng - start.lng) * t;
                
                // Add slight curve
                const offset = Math.sin(t * Math.PI) * 0.001;
                pathCoords.push(createLatLng(lat + offset, lng + offset));
            }
        }
        
        // Add final point
        pathCoords.push(createLatLng(
            stops[stops.length - 1].lat, 
            stops[stops.length - 1].lng
        ));

        const routeColour = getColourForDay(dayIndex + 1);
        const map = getMap();

        const polyline = new google.maps.Polyline({
            path: pathCoords,
            geodesic: true,
            strokeColor: "#2196f3",
            strokeOpacity: 0.9,
            strokeWeight: 3
        });

        polyline.dayIndex = dayIndex;
        polyline.setMap(isDayVisible(dayIndex) ? map : null);

        return polyline;
    }

    /**
     * Create dashed polyline for alternative style
     */
    function createDashedPolyline(stops, dayIndex) {
        const { debugLog, createLatLng } = window.TravelHelpers;
        const { getMap, getColourForDay } = window.TravelGoogleMaps;
        const { isDayVisible } = window.TravelControls;

        debugLog(`Drawing dashed fallback polyline for Day ${dayIndex + 1}`);

        const pathCoords = stops.map(s => createLatLng(s.lat, s.lng));
        const routeColour = getColourForDay(dayIndex + 1);
        const map = getMap();

        // Define the dashed line symbol
        const lineSymbol = {
            path: 'M 0,-1 0,1',
            strokeOpacity: 1,
            scale: 4
        };

        const polyline = new google.maps.Polyline({
            path: pathCoords,
            geodesic: true,
            strokeColor: routeColour,
            strokeOpacity: 0,
            icons: [{
                icon: lineSymbol,
                offset: '0',
                repeat: '20px'
            }]
        });

        polyline.dayIndex = dayIndex;
        polyline.setMap(isDayVisible(dayIndex) ? map : null);

        return polyline;
    }

    /**
     * Handle Directions API error and choose appropriate fallback
     */
    function handleDirectionsError(status, stops, dayIndex) {
        const { debugLog } = window.TravelHelpers;
        
        debugLog(`Directions API failed with status: ${status}`);
        
        // Choose fallback based on error type
        switch (status) {
            case 'ZERO_RESULTS':
                // No route found - use simple polyline
                return createSimplePolyline(stops, dayIndex);
                
            case 'OVER_QUERY_LIMIT':
                // Rate limited - use curved polyline
                return createCurvedPolyline(stops, dayIndex);
                
            case 'REQUEST_DENIED':
            case 'INVALID_REQUEST':
                // API issues - use dashed polyline
                return createDashedPolyline(stops, dayIndex);
                
            default:
                // Unknown error - use simple polyline
                return createSimplePolyline(stops, dayIndex);
        }
    }

    // Export functions for use in routes.js
    window.TravelRouteFallback = {
        createSimplePolyline,
        createCurvedPolyline,
        createDashedPolyline,
        handleDirectionsError
    };
})();