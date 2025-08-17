// static/js/utils/helpers.js - Utility Functions

/**
 * Ensure an element has relative positioning for overlays
 */
function ensureRelativePosition(el) {
    const pos = getComputedStyle(el).position;
    if (pos === 'static' || !pos) {
        el.style.position = 'relative';
    }
}

/**
 * Validate coordinates
 */
function isValidCoordinate(lat, lng) {
    return lat && lng && !isNaN(lat) && !isNaN(lng) && 
           lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * Create a Google Maps LatLng object
 */
function createLatLng(lat, lng) {
    return { lat: Number(lat), lng: Number(lng) };
}

/**
 * Debug logging helper
 */
function debugLog(message, data = null) {
    if (console && console.log) {
        if (data) {
            console.log(message, data);
        } else {
            console.log(message);
        }
    }
}

/**
 * Error logging helper
 */
function errorLog(message, error = null) {
    if (console && console.error) {
        if (error) {
            console.error(message, error);
        } else {
            console.error(message);
        }
    }
}

/**
 * Create a promise that resolves after a delay
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Diagnostic function to check Socket.IO loading status
 */
function diagnoseSocketIOLoading() {
    const diagnostics = {
        timestamp: new Date().toISOString(),
        navigator: {
            userAgent: navigator.userAgent,
            onLine: navigator.onLine,
            connection: navigator.connection ? {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink,
                rtt: navigator.connection.rtt
            } : 'Not supported'
        },
        socketIO: {
            loaded: typeof io !== 'undefined',
            loaderState: window.SocketIOLoader ? {
                loading: window.SocketIOLoader.loading,
                loaded: window.SocketIOLoader.loaded,
                error: window.SocketIOLoader.error
            } : 'Loader not available',
            waitFunction: typeof window.waitForSocketIO === 'function'
        },
        network: {
            protocol: window.location.protocol,
            host: window.location.host,
            origin: window.location.origin
        }
    };
    
    console.log('🔍 Socket.IO Loading Diagnostics:', diagnostics);
    return diagnostics;
}

// Export for other modules
window.TravelHelpers = {
    ensureRelativePosition,
    isValidCoordinate,
    createLatLng,
    debugLog,
    errorLog,
    delay,
    diagnoseSocketIOLoading
};