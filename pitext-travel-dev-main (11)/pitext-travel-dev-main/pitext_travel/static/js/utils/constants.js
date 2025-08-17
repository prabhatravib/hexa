// static/js/utils/constants.js – Shared constants (vector-map ready)
// -----------------------------------------------------------------

// Day color palette - soft, warm, distinct colors for each day
const DAY_COLOR_MAP = {
  1: '#FFADAD', // pastel-red (Day 1)
  2: '#FFD6A5', // pastel-apricot (Day 2)
  3: '#FFCC99', // pastel-peach (Day 3)
  4: '#FFC4E1', // pastel-pink (Day 4)
  5: '#FDFFB6', // pastel-butter (Day 5)
  6: '#FFB3AB', // pastel-coral (Day 6)
  7: '#FFECB3', // pastel-gold (Day 7)
};

// Helper function to get color for any day
function getColourForDay(dayIndex) {
  if (DAY_COLOR_MAP[dayIndex]) {
    return DAY_COLOR_MAP[dayIndex];
  }
  // Generate a gentle pastel for days beyond 7
  const hue = (dayIndex * 45) % 360;
  const saturation = 70;
  const lightness = 85;
  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// 1) Map configuration
const MAP_CONFIG = {
  DEFAULT_CENTER   : { lat: 48.8566, lng: 2.3522 },
  DEFAULT_ZOOM     : 13,
  MAX_ZOOM         : 16,
  MIN_ZOOM         : 10,
  COMFORTABLE_ZOOM : 14,
  OVERVIEW_ZOOM    : 12,
  MAP_ID: 'c3bdabd61cc122adbb5aee9d'
};

// 2) Travel mode
const TRAVEL_MODE = { 
  WALKING: 'WALKING',
  DRIVING: 'DRIVING'
};

// 3) UI colours (remove DAY_COLORS array since we have DAY_COLOR_MAP)
const COLORS = {
  DEFAULT_ROUTE : '#4285f4',
  // DAY_COLORS removed - use DAY_COLOR_MAP instead
};

// 4) API endpoints
const API_ENDPOINTS = {
  CONFIG   : '/travel/api/config',
  ITINERARY: '/travel/api/itinerary'
};

// 5) Map styles (unchanged)
const MAP_STYLES = [
  // hide one-way arrows
  {
    featureType: "road",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }]
  }
];

// 6) Export everything including the color function
window.TravelConstants = {
  MAP_CONFIG,
  TRAVEL_MODE,
  COLORS,
  API_ENDPOINTS,
  MAP_STYLES,
  DAY_COLOR_MAP,
  getColourForDay  // Export the function
};