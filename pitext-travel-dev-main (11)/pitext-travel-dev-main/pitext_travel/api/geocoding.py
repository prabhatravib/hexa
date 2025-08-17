# pitext_travel/api/geocoding.py
from __future__ import annotations

import logging
import math
import requests
from typing import List, Dict, Any, Optional, Tuple
import time
from functools import lru_cache

# ─── existing imports ───────────────────────────────────────────────────────────
import googlemaps
from pitext_travel.api.config import get_google_maps_config
# from pitext_travel.api.models import DayPlan, Stop   # optional – only if you use dataclasses

logger = logging.getLogger(__name__)

_gmaps: googlemaps.Client | None = None
_geocoding_cache: Dict[str, tuple[float, float]] = {}

# Google Places API endpoints
TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate the great circle distance between two points on Earth.
    
    Args:
        lat1, lon1: Latitude and longitude of first point
        lat2, lon2: Latitude and longitude of second point
        
    Returns:
        Distance in kilometers
    """
    R = 6371  # Earth's radius in kilometers
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 + 
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.asin(math.sqrt(a))

def validate_city_match(result: Dict[str, Any], target_city: str) -> bool:
    """Validate that a geocoding result matches the target city.
    
    Args:
        result: Geocoding result from Google Maps API
        target_city: Expected city name
        
    Returns:
        True if the result is in the target city, False otherwise
    """
    if not result or "address_components" not in result:
        return False
    
    # Extract all locality names from the result
    localities = []
    for component in result["address_components"]:
        if "locality" in component.get("types", []):
            localities.append(component["long_name"].lower())
            localities.append(component["short_name"].lower())
    
    # Also check administrative_area_level_1 (state/province) for better context
    states = []
    for component in result["address_components"]:
        if "administrative_area_level_1" in component.get("types", []):
            states.append(component["long_name"].lower())
            states.append(component["short_name"].lower())
    
    target_city_lower = target_city.lower()
    
    # Check if target city is in localities
    if target_city_lower in localities:
        logger.debug(f"City match confirmed: '{target_city}' found in localities: {localities}")
        return True
    
    # Check for partial matches (e.g., "Prayagraj" vs "Prayagraj, Uttar Pradesh")
    for locality in localities:
        if target_city_lower in locality or locality in target_city_lower:
            logger.debug(f"Partial city match: '{target_city}' matches locality '{locality}'")
            return True
    
    logger.warning(f"City mismatch: expected '{target_city}', found localities: {localities}, states: {states}")
    return False

def geocode_with_city_scope(place: str, city: str, country: str = "") -> Optional[tuple[float, float]]:
    """Geocode a place with city-scoped addressing and component filtering.
    
    Args:
        place: Place name to geocode
        city: Target city name
        country: Optional country code (e.g., "IN" for India)
        
    Returns:
        (lat, lng) tuple if found and validated, None otherwise
    """
    try:
        cfg = get_google_maps_config()
        api_key = cfg.get("api_key", "")
        if not api_key:
            logger.error("No Google Maps API key found for geocoding")
            return None
        
        # Build parameters with city-scoped addressing
        params = {
            "address": f"{place}, {city}",
            "key": api_key,
            "language": "en"
        }
        
        # Add component filtering if country is provided
        if country:
            params["components"] = f"locality:{city}|country:{country}"
        
        logger.debug(f"Geocoding '{place}' with city scope: {city}, country: {country}")
        
        # Make API request
        response = requests.get(GEOCODE_URL, params=params, timeout=10)
        
        if response.status_code != 200:
            logger.error(f"Geocoding API error: {response.status_code} - {response.text}")
            return None
        
        data = response.json()
        
        if data.get("status") != "OK":
            logger.warning(f"Geocoding failed for '{place}': {data.get('status')} - {data.get('error_message', '')}")
            return None
        
        results = data.get("results", [])
        if not results:
            logger.warning(f"No geocoding results for '{place}' in {city}")
            return None
        
        # Validate the first result matches our target city
        if not validate_city_match(results[0], city):
            logger.warning(f"City validation failed for '{place}' - result not in {city}")
            return None
        
        # Extract coordinates
        location = results[0]["geometry"]["location"]
        lat = location["lat"]
        lng = location["lng"]
        
        logger.debug(f"Successfully geocoded '{place}' in {city} to {lat}, {lng}")
        return lat, lng
        
    except requests.exceptions.Timeout:
        logger.error(f"Timeout geocoding '{place}' in {city}")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error geocoding '{place}' in {city}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error geocoding '{place}' in {city}: {e}")
        return None

def search_place_with_bias(query: str, city_lat: float, city_lng: float, 
                          bias_km: float = 160, cutoff_km: float = 120) -> Optional[Dict[str, Any]]:
    """Search for a place using the two-step pattern with location bias and distance filtering.
    
    Args:
        query: Place name to search for
        city_lat, city_lng: City center coordinates for bias
        bias_km: Search bias radius in kilometers (default 160km ≈ 100mi)
        cutoff_km: Maximum acceptable distance in kilometers (default 120km)
        
    Returns:
        Place data if found within cutoff distance, None otherwise
    """
    try:
        # Get API key
        cfg = get_google_maps_config()
        api_key = cfg.get("api_key", "")
        if not api_key:
            logger.error("No Google Maps API key found for place search")
            return None
        
        # Prepare request body with location bias and distance ranking
        body = {
            "textQuery": query,
            "locationBias": {
                "circle": {
                    "center": {"latitude": city_lat, "longitude": city_lng},
                    "radius": bias_km * 1000  # Convert to meters
                }
            },
            "rankPreference": "DISTANCE"
        }
        
        logger.debug(f"Searching place '{query}' with bias: {bias_km}km, cutoff: {cutoff_km}km")
        
        # Make API request
        response = requests.post(
            TEXT_SEARCH_URL, 
            json=body, 
            params={"key": api_key}, 
            timeout=5
        )
        
        if response.status_code != 200:
            logger.error(f"Places API error: {response.status_code} - {response.text}")
            return None
        
        data = response.json()
        places = data.get("places", [])
        
        if not places:
            logger.debug(f"No places found for query: {query}")
            return None
        
        # Step 2: Filter results by distance
        for place in places:
            location = place.get("location", {})
            p_lat = location.get("latitude")
            p_lng = location.get("longitude")
            
            if p_lat is None or p_lng is None:
                continue
            
            distance = haversine_km(city_lat, city_lng, p_lat, p_lng)
            
            if distance <= cutoff_km:
                logger.debug(f"Found '{query}' at {p_lat}, {p_lng} (distance: {distance:.1f}km)")
                return place
        
        logger.warning(f"No places found within {cutoff_km}km for query: {query}")
        return None
        
    except requests.exceptions.Timeout:
        logger.error(f"Timeout searching for place: {query}")
        return None
    except requests.exceptions.RequestException as e:
        logger.error(f"Request error searching for place '{query}': {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error searching for place '{query}': {e}")
        return None

def get_coordinates_for_place_with_context(place: str, city: str = "", city_lat: Optional[float] = None, 
                                          city_lng: Optional[float] = None, country: str = "") -> Optional[tuple[float, float]]:
    """Get coordinates for a place using enhanced city-scoped geocoding.
    
    Args:
        place: Place name to geocode
        city: City name for scoping
        city_lat, city_lng: Optional city center coordinates for bias
        country: Optional country code for component filtering
        
    Returns:
        (lat, lng) tuple if found, None otherwise
    """
    # If we have city context, try city-scoped geocoding first
    if city:
        coords = geocode_with_city_scope(place, city, country)
        if coords:
            return coords
    
    # If we have city coordinates, try the two-step pattern with bias
    if city_lat is not None and city_lng is not None:
        place_data = search_place_with_bias(place, city_lat, city_lng)
        if place_data:
            location = place_data.get("location", {})
            lat = location.get("latitude")
            lng = location.get("longitude")
            if lat is not None and lng is not None:
                return lat, lng
    
    # Fall back to traditional geocoding with city name
    if city:
        query = f"{place}, {city}"
        return get_coordinates_for_place(query)
    
    # Last resort: traditional geocoding without context
    return get_coordinates_for_place(place)

def _get_client() -> Optional[googlemaps.Client]:
    """Return a cached googlemaps.Client instance."""
    global _gmaps
    if _gmaps is None:
        try:
            cfg = get_google_maps_config()
            api_key = cfg.get("api_key", "")
            if not api_key:
                logger.error("No Google Maps API key found in config")
                return None
            logger.info(f"Initializing Google Maps client with key: {api_key[:10]}...")
            _gmaps = googlemaps.Client(key=api_key)
        except Exception as e:
            logger.error(f"Failed to initialize Google Maps client: {e}")
            return None
    return _gmaps

@lru_cache(maxsize=1000)
def get_coordinates_for_place(place: str) -> tuple[float, float] | None:
    """Resolve a free-text place name to (lat, lng) or None if not found.
    
    Now uses LRU cache for better performance.
    """
    try:
        client = _get_client()
        if client is None:
            logger.error("No Google Maps client available")
            return None
            
        logger.debug(f"Geocoding place: {place}")
        results = client.geocode(place)  # type: ignore[attr-defined]
        
        if not results:
            logger.warning(f"No results found for place: {place}")
            return None
            
        loc = results[0]["geometry"]["location"]
        logger.debug(f"Geocoded {place} to {loc['lat']}, {loc['lng']}")
        return loc["lat"], loc["lng"]
    except Exception as e:
        logger.error(f"Geocoding error for '{place}': {e}")
        return None

def batch_geocode_places(places: List[str], city: str = "", 
                        city_lat: Optional[float] = None, city_lng: Optional[float] = None,
                        country: str = "") -> Dict[str, tuple[float, float]]:
    """Geocode multiple places efficiently with enhanced city-scoped addressing.
    
    Args:
        places: List of place names to geocode
        city: City name for scoping and validation
        city_lat, city_lng: Optional city center coordinates for bias
        country: Optional country code for component filtering
        
    Returns:
        Dictionary mapping place names to (lat, lng) coordinates
    """
    results = {}
    start_time = time.time()
    
    for place in places:
        # Check cache first
        cache_key = f"{place}_{city}_{country}" if city or country else place
        if cache_key in _geocoding_cache:
            results[place] = _geocoding_cache[cache_key]
            continue
            
        # Try enhanced city-scoped geocoding
        coords = get_coordinates_for_place_with_context(
            place, city, city_lat, city_lng, country
        )
        
        if coords:
            results[place] = coords
            _geocoding_cache[cache_key] = coords  # Cache the result
        else:
            logger.warning(f"Failed to geocode '{place}' in {city}")
    
    duration = time.time() - start_time
    logger.info(f"Batch geocoded {len(places)} places in {city} in {duration:.2f}s")
    
    return results

# ────────────────────────────────────────────────────────────────────────────────
# NEW: itinerary post-processor
# ────────────────────────────────────────────────────────────────────────────────
def enhance_itinerary_with_geocoding(itinerary: List[Dict[str, Any]], 
                                   city: str = "", city_lat: Optional[float] = None, 
                                   city_lng: Optional[float] = None, country: str = "") -> List[Dict[str, Any]]:
    """
    Attach latitude / longitude to every stop in the itinerary with enhanced city-scoped geocoding.

    The function is intentionally lenient:
    * Accepts a list of plain dicts (e.g. JSON from GPT) **or**
      a list of dataclass instances that expose .stops or .location.
    * Adds two keys – "lat" and "lng" – to each stop dict; if the stop
      already has them, they are left untouched.
    * Logs missing or failed look-ups but never raises, so the caller
      can still render the rest of the trip.
    * Uses enhanced city-scoped geocoding with validation.

    Args:
        itinerary: List of day objects with stops
        city: City name for scoping and validation
        city_lat, city_lng: Optional city center coordinates for bias
        country: Optional country code for component filtering
        
    Returns:
        The same list object with coordinates added
    """
    # Collect all place names for batch geocoding
    all_places = []
    place_to_stop_map = {}
    
    for day_idx, day in enumerate(itinerary):
        # Each day can be a dict or a dataclass – handle both.
        stops = None
        if isinstance(day, dict):
            stops = day.get("stops") or day.get("locations")
        else:  # dataclass / object – fall back to attribute access
            stops = getattr(day, "stops", None) or getattr(day, "locations", None)

        if not stops:
            continue

        for stop_idx, stop in enumerate(stops):
            # Stop can be dict or object; normalise to dict-like API.
            name = stop["name"] if isinstance(stop, dict) else getattr(stop, "name", "")
            if not name:
                continue

            # Check if valid coords already present (not null/None)
            has_valid_coords = False
            if isinstance(stop, dict):
                lat = stop.get("lat")
                lng = stop.get("lng")
                has_valid_coords = lat is not None and lng is not None and lat != "null" and lng != "null"
            else:
                lat = getattr(stop, "lat", None)
                lng = getattr(stop, "lng", None)
                has_valid_coords = lat is not None and lng is not None and lat != "null" and lng != "null"
            
            if has_valid_coords:
                logger.debug(f"Skipping geocoding for '{name}' - already has valid coordinates")
                continue

            # Add to batch geocoding list
            all_places.append(name)
            place_to_stop_map[name] = (day_idx, stop_idx, stop)
    
    # Batch geocode all places with enhanced city-scoped geocoding
    if all_places:
        logger.info(f"Batch geocoding {len(all_places)} places in {city}...")
        geocoded_results = batch_geocode_places(
            all_places, city, city_lat, city_lng, country
        )
        
        # Apply results back to stops
        for place_name, coords in geocoded_results.items():
            day_idx, stop_idx, stop = place_to_stop_map[place_name]
            lat, lng = coords
            
            if isinstance(stop, dict):
                stop["lat"] = lat
                stop["lng"] = lng
            else:
                setattr(stop, "lat", lat)
                setattr(stop, "lng", lng)

    return itinerary

# Re-export for clean imports elsewhere
__all__ = [
    "get_coordinates_for_place",
    "get_coordinates_for_place_with_context",
    "search_place_with_bias",
    "enhance_itinerary_with_geocoding",
    "batch_geocode_places",
    "geocode_with_city_scope",
    "validate_city_match",
    "haversine_km",
]
