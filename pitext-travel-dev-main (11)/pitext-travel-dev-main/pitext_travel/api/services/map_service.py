# pitext_travel/api/services/map_service.py
"""Service layer for map-related operations."""

import logging
from typing import Dict, Any, Optional, Tuple

from pitext_travel.api.geocoding import get_coordinates_for_place, get_coordinates_for_place_with_context

logger = logging.getLogger(__name__)


class MapService:
    """Handles map-related operations and geocoding."""
    
    @staticmethod
    def geocode_place(place_name: str, city: str = "", city_lat: Optional[float] = None, 
                     city_lng: Optional[float] = None, country: str = "") -> Optional[Dict[str, float]]:
        """Get coordinates for a place using enhanced city-scoped geocoding.
        
        Args:
            place_name: Name of the place to geocode
            city: City name for scoping and validation
            city_lat, city_lng: Optional city center coordinates for bias
            country: Optional country code for component filtering
            
        Returns:
            Dictionary with lat/lng or None if not found
        """
        try:
            # Use enhanced city-scoped geocoding
            coords = get_coordinates_for_place_with_context(
                place_name, city, city_lat, city_lng, country
            )
            
            if coords:
                lat, lng = coords
                logger.debug(f"Geocoded '{place_name}' in {city} to {lat}, {lng}")
                return {"lat": lat, "lng": lng}
            else:
                logger.warning(f"Failed to geocode '{place_name}' in {city}")
                return None
                
        except Exception as e:
            logger.error(f"Geocoding error for '{place_name}' in {city}: {e}")
            return None
    
    @staticmethod
    def validate_coordinates(lat: float, lng: float) -> bool:
        """Validate that coordinates are within valid ranges.
        
        Args:
            lat: Latitude
            lng: Longitude
            
        Returns:
            True if valid, False otherwise
        """
        return -90 <= lat <= 90 and -180 <= lng <= 180
    
    @staticmethod
    def enrich_itinerary_with_coordinates(itinerary: Dict[str, Any]) -> Dict[str, Any]:
        """Add coordinates to all stops in an itinerary.
        
        Args:
            itinerary: Generated itinerary data
            
        Returns:
            Itinerary with coordinates added to each stop
        """
        if not itinerary or 'days' not in itinerary:
            return itinerary
            
        # Get city from itinerary metadata
        city = itinerary.get('metadata', {}).get('city', '') or ''
        if city is None:
            city = ""
        geocoded_count = 0
        total_stops = 0
        
        for day in itinerary['days']:
            for stop in day.get('stops', []):
                total_stops += 1
                
                # Skip if already has valid coordinates
                if 'location' in stop and MapService.validate_coordinates(
                    stop['location'].get('lat', 0), 
                    stop['location'].get('lng', 0)
                ):
                    geocoded_count += 1
                    continue
                
                # Try to geocode
                place_name = stop.get('name', '')
                if not place_name:
                    continue
                coords = MapService.geocode_place(place_name, city)
                
                if coords:
                    stop['location'] = coords
                    geocoded_count += 1
                else:
                    # Use city center as fallback
                    logger.warning(f"Using city center for '{place_name}'")
                    stop['location'] = itinerary.get('metadata', {}).get('center', {
                        'lat': 0,
                        'lng': 0
                    })
        
        logger.info(f"Geocoded {geocoded_count}/{total_stops} stops successfully")
        return itinerary
    
    @staticmethod
    def calculate_bounds(itinerary: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate bounding box for all stops in an itinerary.
        
        Args:
            itinerary: Itinerary with geocoded stops
            
        Returns:
            Dictionary with north, south, east, west bounds
        """
        if not itinerary or 'days' not in itinerary:
            return {}
            
        lats = []
        lngs = []
        
        for day in itinerary['days']:
            for stop in day.get('stops', []):
                if 'location' in stop:
                    lats.append(stop['location']['lat'])
                    lngs.append(stop['location']['lng'])
        
        if not lats or not lngs:
            return {}
            
        return {
            'north': max(lats),
            'south': min(lats),
            'east': max(lngs),
            'west': min(lngs)
        }
    
    @staticmethod
    def format_place_info(place_name: str, place_type: str = None) -> str:
        """Format place information for display.
        
        Args:
            place_name: Name of the place
            place_type: Optional place type (e.g., 'museum', 'restaurant')
            
        Returns:
            Formatted place description
        """
        if place_type:
            # Convert place_type from API format to readable format
            readable_type = place_type.replace('_', ' ').title()
            return f"{place_name} ({readable_type})"
        return place_name
    
    @staticmethod
    def estimate_travel_time(distance_meters: float, mode: str = "driving") -> int:
        """Estimate travel time based on distance and mode.
        
        Args:
            distance_meters: Distance in meters
            mode: Travel mode (driving, walking, transit)
            
        Returns:
            Estimated time in minutes
        """
        # Average speeds in meters per minute
        speeds = {
            "driving": 666,    # ~40 km/h
            "walking": 83,     # ~5 km/h  
            "transit": 333,    # ~20 km/h
            "bicycling": 250   # ~15 km/h
        }
        
        speed = speeds.get(mode, speeds["driving"])
        return max(1, int(distance_meters / speed))


# Export for use in other modules
__all__ = ['MapService']