// static/js/ui/overlays.js - Loading and Error Overlays

/**
 * Show loading overlay on top of the map
 */
function showLoading(message) {
    const { ensureRelativePosition } = window.TravelHelpers;
    const mapElement = document.getElementById("map");
    if (!mapElement) return;
    ensureRelativePosition(mapElement);

    let overlay = document.getElementById("map-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "map-overlay";
        overlay.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: rgba(0, 0, 0, 0.6);
            color: #f2f2f2;
            font-size: 1.1rem;
            text-align: center;
            z-index: 5;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.2s ease;
        `;
        mapElement.appendChild(overlay);
    }
    
    overlay.innerHTML = `
        <p style="margin: 0 0 0.5rem;">🔄 ${message}</p>
        <p><small>This may take a few moments…</small></p>
    `;
    overlay.classList.add("visible");
}

/**
 * Show error overlay on top of the map
 */
function showError(message) {
    const { ensureRelativePosition, errorLog } = window.TravelHelpers;
    errorLog("Showing error:", message);
    
    const mapElement = document.getElementById("map");
    if (!mapElement) return;
    ensureRelativePosition(mapElement);

    let overlay = document.getElementById("map-overlay");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "map-overlay";
        overlay.style.cssText = `
            position: absolute;
            top: 0; left: 0;
            width: 100%; height: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            background: rgba(255, 255, 255, 0.9);
            color: #c0392b;
            font-size: 1.1rem;
            text-align: center;
            z-index: 5;
            pointer-events: auto;
            transition: opacity 0.2s ease;
        `;
        mapElement.appendChild(overlay);
    } else {
        // If overlay existed from showLoading, override styling
        overlay.style.background = "rgba(255, 255, 255, 0.9)";
        overlay.style.color = "#c0392b";
        overlay.style.pointerEvents = "auto";
    }

    overlay.innerHTML = `
        <h3 style="margin-top: 0;">⚠️ Error</h3>
        <div style="max-width: 500px; text-align: left; margin: 0 auto;">
            ${message}
        </div>
        <button onclick="location.reload()"
                style="margin-top: 1rem;
                       padding: 0.4rem 1rem;
                       background: #007bff;
                       color: white;
                       border: none;
                       border-radius: 4px;
                       cursor: pointer;">
            Reload
        </button>
    `;
    overlay.classList.add("visible");
}

/**
 * Hide any loading/error overlay
 */
function hideOverlay() {
    const el = document.getElementById("map-overlay");
    if (el) {
        el.classList.remove("visible");
        el.innerHTML = "";
    }
}

// Export for other modules
window.TravelOverlays = {
    showLoading,
    showError,
    hideOverlay
};