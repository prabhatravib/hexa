// static/js/map/routes.js
// -------------------------------------------------------------
//  • Draws a walking route (Directions API) or, if that fails,
//    a simple geodesic Polyline for each day.
//  • Keeps a per-day colour in sync with marker colours.
//  • Adds drawRoute(encodedPolyline[, day]) so voice-chat
//    can drop a ready-made route on the map in one call.
// -------------------------------------------------------------

(function() {
    // The redundant check for the Google Maps API has been removed.
    // This is now handled centrally by `module-loader.js` to prevent
    // race conditions and double-loading of scripts.

    // ---------- internal state ----------

    // collection of DirectionsRenderers *and* fallback Polylines
    let currentPaths = [];

    /** Return the same colour the markers use for this day (0-based index). */
    function getRouteColour(dayIndex) {
        return window.TravelConstants.getColourForDay(dayIndex + 1);
    }

    // ---------- main "create all" entry point ----------

    /**
     * Build routes for every day in a trip data object.
     * tripData = { days:[ {label, stops:[{name,lat,lng}, …]}, … ] }
     */
    function createAllRoutes(tripData) {
        const { debugLog } = window.TravelHelpers;

        debugLog('Creating routes for all days …');
        clearAllRoutes();

        tripData.days.forEach((day, dayIndex) => {
            if (Array.isArray(day.stops) && day.stops.length > 1) {
                createDayRoute(day, dayIndex);
            }
        });
    }

    // ---------- one-day route builder ----------

    function createDayRoute(day, dayIndex) {
        const {
            debugLog,
            isValidCoordinate,
            createLatLng
        } = window.TravelHelpers;
        const {
            getMap,
            getDirectionsService
        } = window.TravelGoogleMaps;
        const { TRAVEL_MODE } = window.TravelConstants;
        const { isDayVisible } = window.TravelControls;

        debugLog(`Creating route for Day ${dayIndex + 1} ("${day.label || ''}")`);

        const validStops = (day.stops || []).filter(s =>
            isValidCoordinate(s.lat, s.lng)
        );
        if (validStops.length < 2) {
            debugLog(`  Day ${dayIndex + 1} has <2 valid stops → no route.`);
            return;
        }

        // Directions-API request with DRIVING mode
        const origin      = createLatLng(validStops[0].lat, validStops[0].lng);
        const destination = createLatLng(
            validStops[validStops.length - 1].lat,
            validStops[validStops.length - 1].lng
        );
        const waypoints = validStops.slice(1, -1).map(s => ({
            location: createLatLng(s.lat, s.lng),
            stopover: true
        }));

        const request = {
            origin,
            destination,
            waypoints,
            travelMode: TRAVEL_MODE.DRIVING,  // Changed to DRIVING
            optimizeWaypoints: false,
            avoidHighways: false,  // Allow highways for driving
            avoidTolls: false
        };

        const directionsService = getDirectionsService();
        const map          = getMap();
        const routeColour  = getRouteColour(dayIndex);

        directionsService.route(request, (result, status) => {
            debugLog(
                `  Directions API response for Day ${dayIndex + 1}: ${status}`
            );

            if (status === 'OK' && result) {
                // Extract travel times from each leg
                const travelTimes = [];
                result.routes[0].legs.forEach((leg, i) => {
                    travelTimes.push({
                        duration: leg.duration.text,
                        distance: leg.distance.text,
                        startIndex: i,
                        endIndex: i + 1
                    });
                });

                // Create custom polyline with curves instead of using DirectionsRenderer
                createCurvedRouteWithTimes(validStops, dayIndex, travelTimes);
                
            } else {
                // fallback with estimated times
                debugLog(
                    `  Directions failed (${status}); using fallback curved route.`
                );
                createCurvedRouteWithTimes(validStops, dayIndex, null);
            }
        });
    }

    function createCurvedRouteWithTimes(stops, dayIndex, travelTimes) {
        const { createLatLng } = window.TravelHelpers;
        const { getMap } = window.TravelGoogleMaps;
        const { isDayVisible } = window.TravelControls;
        const map = getMap();
        
        // Create curved segments between each pair of stops
        for (let i = 0; i < stops.length - 1; i++) {
            const start = createLatLng(stops[i].lat, stops[i].lng);
            const end = createLatLng(stops[i + 1].lat, stops[i + 1].lng);
            
            // Create curved path
            const curve = createBezierCurve(start, end);
            
            const polyline = new google.maps.Polyline({
                path: curve,
                geodesic: false,
                strokeColor: "#2196f3",
                strokeOpacity: 0.8,
                strokeWeight: 4,
                map: isDayVisible(dayIndex) ? map : null
            });
            
            polyline.dayIndex = dayIndex;
            currentPaths.push(polyline);
            
            // Add time label
            const timeText = travelTimes ? 
                travelTimes[i].duration : 
                estimateDrivingTime(start, end);
                
            createTimeLabel(start, end, timeText, dayIndex);
        }
    }

    function createBezierCurve(start, end) {
        const points = [];
        const steps = 50; // Number of points in the curve
        
        // Calculate control point offset
        const dx = end.lng - start.lng;
        const dy = end.lat - start.lat;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Perpendicular offset for curve (adjusted for map scale)
        const offsetScale = Math.min(0.15, distance * 2);
        const midX = (start.lng + end.lng) / 2 - dy * offsetScale;
        const midY = (start.lat + end.lat) / 2 + dx * offsetScale;
        
        // Generate bezier curve points
        for (let t = 0; t <= 1; t += 1/steps) {
            const x = (1-t)*(1-t)*start.lng + 2*(1-t)*t*midX + t*t*end.lng;
            const y = (1-t)*(1-t)*start.lat + 2*(1-t)*t*midY + t*t*end.lat;
            points.push({ lat: y, lng: x });
        }
        
        return points;
    }

    function createTimeLabel(start, end, timeText, dayIndex) {
        const { getMap } = window.TravelGoogleMaps;
        const { isDayVisible } = window.TravelControls;
        const map = getMap();
        
        // Calculate midpoint of the curve
        const midLat = (start.lat + end.lat) / 2;
        const midLng = (start.lng + end.lng) / 2;
        
        // Offset slightly to align with curve peak
        const dx = end.lng - start.lng;
        const dy = end.lat - start.lat;
        const offsetScale = Math.min(0.075, Math.sqrt(dx*dx + dy*dy));
        const labelLat = midLat + dx * offsetScale;
        const labelLng = midLng - dy * offsetScale;
        
        // Create label marker
        const labelDiv = document.createElement('div');
        labelDiv.style.cssText = `
            background: white;
            border: 2px solid #2196f3;
            border-radius: 16px;
            padding: 4px 10px;
            font-size: 12px;
            font-weight: 600;
            color: #1976d2;
            box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            white-space: nowrap;
        `;
        labelDiv.textContent = timeText;
        
        const label = new google.maps.marker.AdvancedMarkerElement({
            position: { lat: labelLat, lng: labelLng },
            map: isDayVisible(dayIndex) ? map : null,
            content: labelDiv,
            zIndex: 1000
        });
        
        label.dayIndex = dayIndex;
        currentPaths.push(label); // Store with paths for visibility toggling
    }

    function estimateDrivingTime(start, end) {
        // Haversine distance calculation
        const R = 6371; // Earth's radius in km
        const dLat = (end.lat - start.lat) * Math.PI / 180;
        const dLon = (end.lng - start.lng) * Math.PI / 180;
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(start.lat * Math.PI / 180) * Math.cos(end.lat * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        // Estimate time at 40 km/h average city driving speed
        const hours = distance / 40;
        const minutes = Math.round(hours * 60);
        
        if (minutes < 60) {
            return `${minutes} min`;
        } else {
            const h = Math.floor(minutes / 60);
            const m = minutes % 60;
            return m > 0 ? `${h} hr ${m} min` : `${h} hr`;
        }
    }

    // ---------- fallback polyline ----------

    function createSimplePolyline(stops, dayIndex) {
        // Just call the new curved route function
        createCurvedRouteWithTimes(stops, dayIndex, null);
    }

    // ---------- utilities ----------

    function clearAllRoutes() {
        currentPaths.forEach(p => p.setMap?.(null));
        currentPaths = [];
    }

    function toggleRoutesForDay(dayIndex, visible) {
        const { debugLog } = window.TravelHelpers;
        const { getMap }   = window.TravelGoogleMaps;

        debugLog(
            `Toggling routes for Day ${dayIndex + 1} → ${visible ? 'show' : 'hide'}`
        );

        currentPaths.forEach(p => {
            if (p.dayIndex === dayIndex) {
                if (p.setMap) {
                    // Regular polyline
                    p.setMap(visible ? getMap() : null);
                } else if (p.map !== undefined) {
                    // AdvancedMarkerElement (time labels)
                    p.map = visible ? getMap() : null;
                }
            }
        });
    }

    // ---------- map orientation helpers ----------
    /**
     * Compute the heading (bearing) from the first to last stop of the day.
     * Returns a value in [0, 360) degrees suitable for map.setHeading().
     */
    function getDayHeading(stops) {
        if (!stops || stops.length < 2) return 0;
        const start = new google.maps.LatLng(stops[0].lat, stops[0].lng);
        const end = new google.maps.LatLng(stops[stops.length - 1].lat, stops[stops.length - 1].lng);
        let bearing = google.maps.geometry.spherical.computeHeading(start, end);
        if (bearing < 0) bearing += 360;
        return bearing;
    }

    /**
     * Rotate and tilt the map so the route for the day points "up".
     * Optionally fits bounds to keep the route visible.
     */
    function orientMapToDay(stops) {
        if (!stops || stops.length < 2) return;
        const map = window.TravelGoogleMaps.getMap();
        // Convert stops to [{lat, lng}] format for the helper
        const path = stops.map(pt => ({ lat: pt.lat, lng: pt.lng }));
        window.TravelGoogleMaps.focusDayFromBehind(map, path);
    }

    // ---------- "voice chat" helper ----------
    //
    // drawRoute(encodedPolyline[, dayIndex = 0])
    // ------------------------------------------------
    // Called by chat.js when the back-end returns an
    // already-computed polyline.

    const dayLayers = []; // one Polyline per day

    function drawRoute(encoded, day = 0) {
        const map = window.TravelGoogleMaps.getMap();

        // remove old layer for that day, if any
        if (dayLayers[day]) dayLayers[day].setMap(null);

        const path = google.maps.geometry.encoding.decodePath(encoded);
        const line = new google.maps.Polyline({
            path,
            geodesic: true,
            strokeColor: "#2196f3",
            strokeOpacity: 0.9,
            strokeWeight: 3,
            map
        });

        dayLayers[day] = line;

        // fit viewport
        const bounds = new google.maps.LatLngBounds();
        path.forEach(p => bounds.extend(p));
        map.fitBounds(bounds, 80);
    }

    // ---------- export to global namespace ----------

    window.TravelRoutes = {
        createAllRoutes,
        createDayRoute,
        clearAllRoutes,
        toggleRoutesForDay,
        orientMapToDay,
        getDayHeading
    };

    // Make the quick helper globally reachable (e.g. from chat.js)
    window.drawRoute = drawRoute;
})();