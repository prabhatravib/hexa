// static/js/ui/panel.js  – Minimise / expand logic
// -------------------------------------------------
// • Adds / removes the class "minimized" on #panel.
// • CSS in panel.css already hides the form inputs and
//   keeps only the Day-controls row visible in that state.

function initializePanel() {
  const panel       = document.getElementById('panel');
  const minimizeBtn = document.getElementById('minimize-btn');

  // defensive – if markup missing, bail early
  if (!panel || !minimizeBtn) return;

  let isMinimized = false;

  minimizeBtn.addEventListener('click', () => {
    isMinimized = !isMinimized;

    // ↓ this is the only class the CSS cares about
    panel.classList.toggle('minimized', isMinimized);

    // update button glyph & tooltip
    minimizeBtn.textContent = isMinimized ? '+' : '−';
    minimizeBtn.title       = isMinimized ? 'Expand' : 'Minimize';
  });
}

// expose for main app bootstrap
window.TravelPanel = { initializePanel };
