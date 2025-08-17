// static/js/api/client.js - API Communication

/**
 * Fetch itinerary from Flask backend
 */
async function fetchItinerary(city = "Paris", days = 3) {
    const { debugLog, errorLog } = window.TravelHelpers || { 
        debugLog: console.log, 
        errorLog: console.error 
    };
    const { API_ENDPOINTS } = window.TravelConstants || { 
        API_ENDPOINTS: { ITINERARY: '/travel/api/itinerary' } 
    };
    
    debugLog(`Fetching itinerary for ${city}, ${days} days...`);
    
    const endpoint = API_ENDPOINTS.ITINERARY;
    const fetchOptions = city && days ? {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, days })
    } : undefined;

    try {
        const response = await fetch(endpoint, fetchOptions);
        
        debugLog("API response status:", response.status);
        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }
        
        const data = await response.json();
        debugLog("API response data:", data);
        
        if (!data.days || !Array.isArray(data.days)) {
            errorLog("Invalid data structure:", data);
            throw new Error("Invalid itinerary data received from server");
        }
        
        if (data.days.length === 0) {
            throw new Error("No itinerary data returned");
        }
        
        return data;
    } catch (error) {
        errorLog("Fetch error:", error);
        throw error;
    }
}

// Export for other modules
window.TravelAPI = {
    fetchItinerary
};