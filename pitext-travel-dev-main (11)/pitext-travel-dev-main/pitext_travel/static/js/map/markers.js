// static/js/map/markers.js
// ---------------------------------------------------------
//  • Uses official Google Places icons when available via
//    `stop.iconUrl`; falls back to coloured circles.
//  • getColourForDay(dayIndex) keeps per-day hues consistent.
//  • Exposes window.showPOIs so other modules can drop
//    ad-hoc points of interest onto the same map layer.
// ---------------------------------------------------------

(function() {
    // The redundant check for the Google Maps API has been removed.
    // This is now handled centrally by `module-loader.js` to prevent
    // race conditions and double-loading of scripts.

    // ---------- Trip-stop markers ----------

    let currentMarkers = [];

    /**
     * Create a marker for one itinerary stop (Advanced Markers API)
     */
    // Make sure the object exists even if something later throws
    if (!window.TravelMarkers) window.TravelMarkers = {};

    function createMarker(stop, day, dayIndex, stopIndex) {
      const { isValidCoordinate, createLatLng, debugLog } = window.TravelHelpers;
      const { getMap, getColourForDay } = window.TravelGoogleMaps;
      const { isDayVisible } = window.TravelControls;

      if (!isValidCoordinate(stop.lat, stop.lng)) {
        debugLog(`Skipping stop ${stop.name} – invalid coordinates`, stop);
        return null;
      }

      const position = createLatLng(stop.lat, stop.lng);
      const map      = getMap();

      // Colour code for this day
      const dayColor = window.TravelConstants.getColourForDay(dayIndex + 1);

      const pinElement = new google.maps.marker.PinElement({
        background: dayColor,
        borderColor: '#FFFFFF',
        glyphColor:  '#FFFFFF',
        scale: 1.0
      });
      pinElement.element.style.opacity = '0.8';

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position,
        map: isDayVisible(dayIndex) ? map : null,
        title: stop.name,
        content: pinElement.element,
        gmpClickable: true,
        zIndex: -1000 - stopIndex
      });

      // InfoWindow
      const placeTypeDisplay = stop.placeType
          ? stop.placeType.replace(/_/g, ' ')
          : 'attraction';

      marker.infoWindow = new google.maps.InfoWindow({
        content: `
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
          </div>`
      });

      marker.addListener('click', () => {
        closeAllInfoWindows();
        marker.infoWindow.open(map, marker);
      });

      marker.dayIndex = dayIndex;
      return marker;
    }

    /**
     * Build all itinerary markers and return viewport bounds
     */
    function createAllMarkers(tripData) {
      const { debugLog } = window.TravelHelpers;
      const bounds = new google.maps.LatLngBounds();
      let totalStops = 0;

      clearAllMarkers();

      tripData.days.forEach((day, dayIndex) => {
        debugLog(`Processing day ${dayIndex + 1}: ${day.label}`, day);
        if (!Array.isArray(day.stops)) {
          debugLog(`Day ${dayIndex + 1} has no stops`);
          return;
        }

        day.stops.forEach((stop, stopIndex) => {
          const marker = createMarker(stop, day, dayIndex, stopIndex);
          if (marker) {
            currentMarkers.push(marker);
            bounds.extend(marker.position);
            totalStops += 1;
          }
        });
      });

      debugLog(`Created ${currentMarkers.length} markers for ${totalStops} stops`);
      return { bounds, totalStops };
    }

    function clearAllMarkers() {
      currentMarkers.forEach(m => {
        m.infoWindow?.close();
        m.map = null;
      });
      currentMarkers = [];
    }

    function closeAllInfoWindows() {
      currentMarkers.forEach(m => m.infoWindow?.close());
    }

    function toggleMarkersForDay(dayIndex, visible) {
      const { getMap } = window.TravelGoogleMaps;
      currentMarkers.forEach(m => {
        if (m.dayIndex === dayIndex) {
          m.map = visible ? getMap() : null;
          if (!visible) m.infoWindow?.close();
        }
      });
    }

    function getAllMarkers() {
      return currentMarkers;
    }

    // ---------- "Ad-hoc" POI markers for voice chat ----------

    let poiMarkers = [];

    /**
     * Drop an arbitrary list of POIs on the map (clears previous POI layer)
     * list = [ {name, lat, lng}, … ]
     */
    function showPOIs(list) {
      const { getMap } = window.TravelGoogleMaps;
      const map = getMap();

      // clear previous batch
      poiMarkers.forEach(m => m.setMap(null));
      poiMarkers = [];

      list.forEach(({ name, lat, lng }) => {
        const marker = new google.maps.Marker({
          position: { lat, lng },
          title: name,
          map,
          icon: {
            url: '/static/img/poi.svg',
            scaledSize: new google.maps.Size(28, 28)
          }
        });
        poiMarkers.push(marker);
      });
    }

    // ---------- Exports ----------

    Object.assign(window.TravelMarkers, {
      createMarker,
      createAllMarkers,
      clearAllMarkers,
      closeAllInfoWindows,
      toggleMarkersForDay,
      getAllMarkers,
      showPOIs
    });

    // quick global handles for modules that don't import TravelMarkers
    window.showPOIs = showPOIs;
})();