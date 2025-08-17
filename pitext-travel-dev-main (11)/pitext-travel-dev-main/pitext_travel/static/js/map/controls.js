// static/js/map/controls.js
// ----------------------------
//  • Renders "Day 1 / Day 2 / …" toggle checkboxes.
//  • Each label's text colour is taken from getColourForDay(dayIndex + 1),
//    so it will match the corresponding marker & route colour.
// ----------------------------
(function() {
    // This module now relies on TravelDayControls (day_controls_core.js)
    // for all state management.

    /**
     * Render day control checkboxes
     *
     * @param {Array<Object>} days
     *   Each element is { label?: string, stops: [...] }.
     */
    function renderDayControls(days) {
      const { debugLog } = window.TravelHelpers;
      const { initializeDayVisibility, getDayVisibility } = window.TravelDayControls;
      debugLog("Rendering day controls for", days.length, "days");

      const controls = document.getElementById("day-controls");
      if (!controls) {
        debugLog("Day controls container not found");
        return;
      }

      // Clear existing controls
      clearDayControls();

      // Initialize visibility state using the core module
      initializeDayVisibility(days.length, window.currentDayVisibility);
      const dayVisibility = getDayVisibility();
      debugLog("Day visibility initialized:", dayVisibility);

      controls.style.display = "flex";
      controls.style.gap = "1rem";
      controls.style.alignItems = "flex-start";

      days.forEach((day, i) => {
        const wrapper = document.createElement("div");
        wrapper.style.display = "flex";
        wrapper.style.flexDirection = "column";
        wrapper.style.alignItems = "center";
        wrapper.style.gap = "0.3rem";

        const label = document.createElement("label");
        const colour = window.TravelGoogleMaps.getColourForDay(i + 1);

        label.style.color = colour;
        label.style.fontWeight = "bold";
        label.style.fontSize = "0.9rem";
        label.textContent = day.label || `Day ${i + 1}`;
        label.style.cursor = "pointer";
        label.setAttribute("for", `day-checkbox-${i}`);

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `day-checkbox-${i}`;
        checkbox.checked = dayVisibility[i] !== false;
        checkbox.style.cursor = "pointer";
        checkbox.style.width = "18px";
        checkbox.style.height = "18px";
        checkbox.onchange = () => window.TravelDayControls.toggleDay(i);

        wrapper.appendChild(label);
        wrapper.appendChild(checkbox);
        controls.appendChild(wrapper);
      });

      // Listen for external visibility changes to update checkboxes
      document.addEventListener('dayVisibilityChanged', (e) => {
        const { dayIndex, visible } = e.detail;
        const checkbox = document.getElementById(`day-checkbox-${dayIndex}`);
        if (checkbox) {
          checkbox.checked = visible;
        }
      });

      debugLog(`Created ${days.length} day control checkboxes`);
    }

    /**
     * Get whether a given day is currently visible
     *
     * @param {number} dayIndex - Zero-based index of the day
     * @returns {boolean}
     */
    function isDayVisible(dayIndex) {
      // Delegate to the core module
      return window.TravelDayControls.getDayVisibility(dayIndex);
    }

    /**
     * Clear all day‐control checkboxes (for re‐rendering)
     */
    function clearDayControls() {
      const controls = document.getElementById("day-controls");
      if (controls) {
        while (controls.firstChild) {
          controls.removeChild(controls.firstChild);
        }
      }
      // Delegate reset to the core module
      if (window.TravelDayControls) {
          window.TravelDayControls.resetVisibility();
      }
    }

    // Export these functions for other modules to use
    window.TravelControls = {
      renderDayControls,
      isDayVisible,
      clearDayControls
    };
})();