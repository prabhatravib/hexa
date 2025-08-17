// static/js/map/google-maps.js - Core Google Maps Initialization
// Simplified version focusing on map setup without POI functionality

(function() {
    // Day colour helper
    const DAY_COLOR_MAP = {
        1: '#FFADAD', 2: '#FFD6A5', 3: '#FDFFB6',
        4: '#FFC4E1', 5: '#FFCC99', 6: '#FFB3AB', 7: '#FFECB3'
    };
    
    function getColourForDay(dayIndex) {
        if (DAY_COLOR_MAP[dayIndex]) return DAY_COLOR_MAP[dayIndex];
        const hue = (dayIndex * 45) % 360;
        return `hsl(${hue},70%,85%)`;
    }

    // Map instance and services
    let map = null;
    let directionsService = null;
    let isGoogleMapsLoaded = false;

    /**
     * Add diagonal view toggle button
     */
    function addDiagonalViewButton() {
        const viewButton = document.createElement('button');
        viewButton.innerHTML = `📐`; // Angle icon
        
        viewButton.style.cssText = `
            position: absolute;
            top: 1rem;
            right: 1rem;
            width: 44px;
            height: 44px;
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(0, 0, 0, 0.1);
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
            cursor: pointer;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            transition: all 0.2s ease;
        `;
        
        let isDiagonal = true; // Start with diagonal view as default
        
        viewButton.addEventListener('click', () => {
            isDiagonal = !isDiagonal;
            
            if (isDiagonal) {
                // Switch TO diagonal view
                map.setTilt(45);  // This creates the angled perspective
                map.setHeading(235); // Set the rotation
                viewButton.innerHTML = '📏'; // Flat icon
                viewButton.title = 'Switch to top-down view';
                viewButton.style.background = 'rgba(25, 118, 210, 0.9)';
                viewButton.style.color = 'white';
            } else {
                // Switch BACK to top-down view
                map.setTilt(0);   // This goes back to flat view
                map.setHeading(0); // Reset rotation
                viewButton.innerHTML = '📐'; // Angle icon
                viewButton.title = 'Switch to diagonal view';
                viewButton.style.background = 'rgba(255, 255, 255, 0.9)';
                viewButton.style.color = '#333';
            }
        });
        
        viewButton.title = 'Switch to top-down view';
        viewButton.innerHTML = '📏'; // Start with flat icon since we're in diagonal mode
        viewButton.style.background = 'rgba(25, 118, 210, 0.9)';
        viewButton.style.color = 'white';
        document.getElementById('map').appendChild(viewButton);
    }

    /**
     * Initialize Google Maps
     */
    function initializeGoogleMap() {
        const { MAP_CONFIG, MAP_STYLES } = window.TravelConstants;
        const { debugLog } = window.TravelHelpers;
        
        const mapElement = document.getElementById('map');
        if (!mapElement) {
            console.error('Map element not found');
            return;
        }

        // Hide the loading message once map is initialized
        const loadingDiv = document.querySelector('#map .loading');
        if (loadingDiv) {
            loadingDiv.style.display = 'none';
        }

        // Create the map
        map = new google.maps.Map(mapElement, {
            center: MAP_CONFIG.DEFAULT_CENTER,
            zoom: MAP_CONFIG.DEFAULT_ZOOM,
            mapId: MAP_CONFIG.MAP_ID,
            disableDefaultUI: true,
            
            // Enable diagonal/angled view by default
            tilt: 45,                    // Start with diagonal view (45° angle)
            heading: 235,                // Rotate NE→SW for better perspective
            mapTypeId: 'roadmap',        // Use roadmap for minimal, vector-based look
            gestureHandling: 'greedy',

            styles: [
                // Hide POI labels (as in user request)
                { 
                    featureType: "poi",    
                    elementType: "labels",   
                    stylers: [{ visibility: "off" }] 
                },
                // Keep road geometry but hide direction arrows and labels
                { 
                    featureType: "road",   
                    elementType: "labels",   
                    stylers: [{ visibility: "off" }] 
                },
                { 
                    featureType: "road",   
                    elementType: "labels.icon", 
                    stylers: [{ visibility: "off" }] 
                },
                // Simplify road appearance
                { 
                    featureType: "road", 
                    elementType: "geometry", 
                    stylers: [
                        { "color": "#f0f0f0" },
                        { "weight": 0.5 }
                    ] 
                }
            ]
        });

        // Initialize directions service
        directionsService = new google.maps.DirectionsService();

        // Mark as loaded
        isGoogleMapsLoaded = true;

        debugLog('Google Maps initialized successfully');

        // Add diagonal view button
        addDiagonalViewButton();

        // Fire custom event
        document.dispatchEvent(new CustomEvent('mapsApiReady', {
            detail: { map: map }
        }));

        // Process any pending renders
        if (window.pendingRender) {
            debugLog('Processing pending render after map init');
            setTimeout(() => {
                if (window.TravelApp && window.TravelApp.renderTripOnMap) {
                    window.TravelApp.renderTripOnMap(window.pendingRender);
                    window.pendingRender = null;
                }
            }, 500);
        }
    }

    /**
     * Fit map bounds to show all markers
     */
    function fitMapToBounds(bounds, totalStops) {
        const { MAP_CONFIG } = window.TravelConstants;
        const { debugLog } = window.TravelHelpers;
        
        if (!map || !bounds || bounds.isEmpty() || !totalStops) {
            debugLog('Cannot fit bounds - invalid parameters');
            return;
        }

        map.fitBounds(bounds);
        
        // Adjust zoom after bounds change
        google.maps.event.addListenerOnce(map, 'bounds_changed', () => {
            const currentZoom = map.getZoom();
            
            if (currentZoom > MAP_CONFIG.MAX_ZOOM) {
                map.setZoom(MAP_CONFIG.COMFORTABLE_ZOOM);
            } else if (currentZoom < MAP_CONFIG.MIN_ZOOM) {
                map.setZoom(MAP_CONFIG.OVERVIEW_ZOOM);
            }
        });
    }

    /**
     * Set map center and zoom
     */
    function setMapView(center, zoom) {
        if (!map) return;
        
        if (center) {
            map.setCenter(center);
        }
        if (zoom) {
            map.setZoom(zoom);
        }
    }

    /**
     * Get current map bounds
     */
    function getMapBounds() {
        return map ? map.getBounds() : null;
    }

    /**
     * Add a map listener
     */
    function addMapListener(event, callback) {
        if (!map) return null;
        return map.addListener(event, callback);
    }

    /**
     * Show the day from a “helicopter behind the start” viewpoint.
     * @param {google.maps.Map} map        – your live map
     * @param {{lat:number,lng:number}[]}  path – ordered LatLngs of the day’s route
     */
    function focusDayFromBehind(map, path) {
        if (!path || !path.length) return;
        const start = path[0];
        const end = path[path.length - 1];
        // 1. Heading from start → end  (-180…180°)
        let heading = google.maps.geometry.spherical.computeHeading(start, end);
        if (heading < 0) heading += 360;
        // 2. Put camera 300 m behind the start, opposite the heading
        const CAMERA_BACKOFF_METERS = 300;
        const behindStart = google.maps.geometry.spherical.computeOffset(
            start,
            CAMERA_BACKOFF_METERS,
            heading + 180
        );
        // 3. Fly the camera there
        map.moveCamera({
            center: behindStart,
            heading: heading,
            tilt: 50,
            zoom: 16
        });
        // 4. Optional: fit bounds after camera settles
        google.maps.event.addListenerOnce(map, "idle", () => {
            const bounds = path.reduce(
                (b, ll) => (b.extend(ll), b),
                new google.maps.LatLngBounds()
            );
            map.fitBounds(bounds, { top: 80, bottom: 40, left: 60, right: 60 });
            map.setHeading(heading);
            map.setTilt(50);
        });
    }

    // Export public API
    window.TravelGoogleMaps = {
        initializeGoogleMap,
        getMap: () => map,
        getDirectionsService: () => directionsService,
        isMapLoaded: () => isGoogleMapsLoaded,
        fitMapToBounds,
        setMapView,
        getMapBounds,
        addMapListener,
        // Reference the function from constants instead
        getColourForDay: window.TravelConstants.getColourForDay,
        focusDayFromBehind // Export the new helper
    };
})();