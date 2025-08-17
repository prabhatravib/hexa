// static/js/ui/form.js - Form Handling

/**
 * Initialize form event handlers
 */
function initializeForm() {
    const { debugLog } = window.TravelHelpers;
    const form = document.getElementById("trip-form");
    
    if (form) {
        form.addEventListener("submit", handleFormSubmit);
        debugLog("Form handler initialized");
    }
}

/**
 * Handle form submission
 */
async function handleFormSubmit(e) {
    e.preventDefault();
    
    const { debugLog } = window.TravelHelpers;
    const { showError } = window.TravelOverlays;
    const { processItinerary } = window.TravelApp;
    
    const city = document.getElementById("city").value.trim();
    const days = parseInt(document.getElementById("days").value, 10);
    
    debugLog(`Planning trip: ${city}, ${days} days`);
    
    if (city && days > 0) {
        try {
            await processItinerary(city, days);
        } catch (error) {
            showError(`Failed to process itinerary: ${error.message}`);
        }
    } else {
        showError("Please enter a valid city name and number of days");
    }
}

// Export for other modules
window.TravelForm = {
    initializeForm
};