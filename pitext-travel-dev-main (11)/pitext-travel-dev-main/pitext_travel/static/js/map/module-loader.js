// static/js/map/module-loader.js
// Map module loader

window.mapModulesLoaded = false;
window.mapModulesReady = false;

window.loadMapModules = () => {
  if (window.mapModulesLoaded) return;
  
  // Ensure Google Maps is fully ready
  if (!window.google || !window.google.maps || !window.google.maps.marker) {
    console.log('Waiting for Google Maps API to be fully ready...');
    setTimeout(window.loadMapModules, 100);
    return;
  }

  console.log('Google Maps API ready, loading map modules...');

  const list = [
    '/static/js/map/markers.js',
    '/static/js/map/routes.js',
    '/static/js/map/controls.js'
  ];
  
  let done = 0;
  let failed = 0;
  
  list.forEach(src => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => {
      done++;
      console.log(`[MAP] Loaded: ${src}`);
      if (done + failed === list.length) {
        if (failed === 0) {
          window.mapModulesLoaded = true;
          window.mapModulesReady = true;
          console.log('[MAP] All modules loaded successfully');
          
          // Trigger any pending renders
          if (window.pendingRender) {
            console.log('[MAP] Rendering pending itinerary');
            if (window.TravelApp && window.TravelApp.renderTripOnMap) {
              window.TravelApp.renderTripOnMap(window.pendingRender);
              window.pendingRender = null;
            }
          }
        } else {
          console.error('[MAP] Some modules failed to load');
        }
      }
    };
    s.onerror = () => {
      failed++;
      console.error('[MAP] Failed to load:', src);
      if (done + failed === list.length) {
        console.error('[MAP] Module loading failed');
      }
    };
    document.head.appendChild(s);
  });
};