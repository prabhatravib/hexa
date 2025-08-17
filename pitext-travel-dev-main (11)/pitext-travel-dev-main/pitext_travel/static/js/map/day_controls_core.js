// static/js/map/day_controls_core.js - Core Day Control Logic
// Extracted from controls.js to handle day visibility state

(function() {
    // Store current visibility state globally
    let dayVisibility = {};

    /**
     * Initialize day visibility state
     * @param {number} numDays - Total number of days
     * @param {Object} previousState - Previous visibility state to restore
     */
    function initializeDayVisibility(numDays, previousState = null) {
        if (previousState && Object.keys(previousState).length > 0) {
            // Restore previous state
            dayVisibility = { ...previousState };
        } else {
            // Default: only first day visible
            dayVisibility = {};
            for (let i = 0; i < numDays; i++) {
                dayVisibility[i] = i === 0;
            }
        }
        
        // Save globally for persistence
        window.currentDayVisibility = dayVisibility;
    }

    /**
     * Toggle visibility for a specific day
     * @param {number} dayIndex - Zero-based day index
     */
    function toggleDay(dayIndex) {
        const { debugLog } = window.TravelHelpers;
        const { toggleMarkersForDay } = window.TravelMarkers;
        const { toggleRoutesForDay } = window.TravelRoutes;

        debugLog(`Toggling day ${dayIndex + 1}`);

        // Update visibility state
        dayVisibility[dayIndex] = !dayVisibility[dayIndex];
        
        // Save state globally
        window.currentDayVisibility = dayVisibility;

        // Update markers and routes visibility
        toggleMarkersForDay(dayIndex, dayVisibility[dayIndex]);
        toggleRoutesForDay(dayIndex, dayVisibility[dayIndex]);
        
        // Fire custom event for other components
        document.dispatchEvent(new CustomEvent('dayVisibilityChanged', {
            detail: {
                dayIndex: dayIndex,
                visible: dayVisibility[dayIndex],
                allVisibility: { ...dayVisibility }
            }
        }));
    }

    /**
     * Set visibility for a specific day
     * @param {number} dayIndex - Zero-based day index
     * @param {boolean} visible - Visibility state
     */
    function setDayVisibility(dayIndex, visible) {
        if (dayVisibility[dayIndex] !== visible) {
            toggleDay(dayIndex);
        }
    }

    /**
     * Show only a specific day
     * @param {number} dayIndex - Zero-based day index
     */
    function showOnlyDay(dayIndex) {
        const { debugLog } = window.TravelHelpers;
        debugLog(`Showing only day ${dayIndex + 1}`);
        
        // Hide all days
        Object.keys(dayVisibility).forEach(idx => {
            const index = parseInt(idx);
            if (dayVisibility[index]) {
                toggleDay(index);
            }
        });
        
        // Show selected day
        if (!dayVisibility[dayIndex]) {
            toggleDay(dayIndex);
        }
    }

    /**
     * Show all days
     */
    function showAllDays() {
        const { debugLog } = window.TravelHelpers;
        debugLog("Showing all days");
        
        Object.keys(dayVisibility).forEach(idx => {
            const index = parseInt(idx);
            if (!dayVisibility[index]) {
                toggleDay(index);
            }
        });
    }

    /**
     * Hide all days
     */
    function hideAllDays() {
        const { debugLog } = window.TravelHelpers;
        debugLog("Hiding all days");
        
        Object.keys(dayVisibility).forEach(idx => {
            const index = parseInt(idx);
            if (dayVisibility[index]) {
                toggleDay(index);
            }
        });
    }

    /**
     * Get current visibility state
     * @param {number} dayIndex - Optional specific day index
     * @returns {boolean|Object} Visibility for specific day or all days
     */
    function getDayVisibility(dayIndex = null) {
        if (dayIndex !== null) {
            return dayVisibility[dayIndex] !== false;
        }
        return { ...dayVisibility };
    }

    /**
     * Reset visibility state
     */
    function resetVisibility() {
        dayVisibility = {};
        window.currentDayVisibility = {};
    }

    // Export functions
    window.TravelDayControls = {
        initializeDayVisibility,
        toggleDay,
        setDayVisibility,
        showOnlyDay,
        showAllDays,
        hideAllDays,
        getDayVisibility,
        resetVisibility
    };
})();