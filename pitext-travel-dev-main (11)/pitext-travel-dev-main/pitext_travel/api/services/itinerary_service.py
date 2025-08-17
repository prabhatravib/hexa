# pitext_travel/api/services/itinerary_service.py
"""Service layer for itinerary generation and management."""

import logging
from typing import Dict, Any, Optional
from flask import session

from pitext_travel.api.llm import generate_trip_itinerary

logger = logging.getLogger(__name__)


class ItineraryService:
    """Handles itinerary generation and session management."""
    
    @staticmethod
    def generate_itinerary(city: str, days: int) -> Dict[str, Any]:
        """Generate a new itinerary for the given city and days.
        
        Args:
            city: City name
            days: Number of days
            
        Returns:
            Generated itinerary data
            
        Raises:
            ValueError: If invalid parameters
            Exception: If generation fails
        """
        if not city or not isinstance(city, str):
            raise ValueError("Invalid city parameter")
            
        if not days or days < 1 or days > 14:
            raise ValueError("Days must be between 1 and 14")
            
        try:
            logger.info(f"Generating itinerary for {city}, {days} days")
            itinerary = generate_trip_itinerary(city, days)
            
            # Store in session
            ItineraryService.store_in_session(itinerary, city, days)
            
            return itinerary
            
        except Exception as e:
            logger.error(f"Failed to generate itinerary: {e}")
            raise
    
    @staticmethod
    def store_in_session(itinerary: Dict[str, Any], city: str, days: int) -> None:
        """Store itinerary data in Flask session.
        
        Args:
            itinerary: Generated itinerary data
            city: City name
            days: Number of days
        """
        session['current_itinerary'] = itinerary
        session['current_city'] = city
        session['current_days'] = days
        session.modified = True
        logger.debug(f"Stored itinerary in session for {city}")
    
    @staticmethod
    def get_from_session() -> Optional[Dict[str, Any]]:
        """Get current itinerary from session.
        
        Returns:
            Itinerary data or None if not found
        """
        return session.get('current_itinerary')
    
    @staticmethod
    def get_session_info() -> Dict[str, Any]:
        """Get current session information.
        
        Returns:
            Dictionary with session info
        """
        return {
            'has_itinerary': 'current_itinerary' in session,
            'current_city': session.get('current_city'),
            'current_days': session.get('current_days')
        }
    
    @staticmethod
    def clear_session() -> None:
        """Clear itinerary data from session."""
        keys_to_remove = ['current_itinerary', 'current_city', 'current_days']
        for key in keys_to_remove:
            session.pop(key, None)
        session.modified = True
        logger.debug("Cleared itinerary from session")
    
    @staticmethod
    def format_voice_response(itinerary: Dict[str, Any], city: str, days: int) -> str:
        """Format itinerary for voice response.
        
        Args:
            itinerary: Generated itinerary data
            city: City name
            days: Number of days
            
        Returns:
            Formatted voice response string
        """
        if not itinerary or 'days' not in itinerary:
            return f"I couldn't create an itinerary for {city}."
            
        bullet_lines = []
        for i, day in enumerate(itinerary['days'], 1):
            stops = ', '.join([s['name'] for s in day['stops']])
            bullet_lines.append(f"Day {i}: {stops}.")
            
        voice_response = (
            f"Your {days}-day adventure in {city} is ready! "
            + " ".join(bullet_lines)
            + " Say a day number if you'd like more detail."
        )
        
        return voice_response
    
    @staticmethod
    def format_day_explanation(itinerary: Dict[str, Any], city: str, day_number: int) -> str:
        """Format explanation for a specific day.
        
        Args:
            itinerary: Current itinerary data
            city: City name
            day_number: Day to explain (0 for overview)
            
        Returns:
            Formatted explanation string
        """
        if not itinerary or 'days' not in itinerary:
            return "I don't have a current itinerary to explain. Would you like me to plan a trip first?"
        
        days = itinerary['days']
        
        if day_number == 0:
            # Overview
            response = f"Here's your complete {len(days)}-day itinerary for {city}: "
            
            for i, day in enumerate(days):
                stops = [stop['name'] for stop in day['stops']]
                response += f"Day {i + 1}: You'll visit {', '.join(stops)}. "
            
            response += "Which day would you like me to explain in more detail?"
            
        else:
            # Specific day
            if 0 < day_number <= len(days):
                day = days[day_number - 1]
                response = f"On day {day_number} in {city}, here's your plan: "
                
                for j, stop in enumerate(day['stops'], 1):
                    response += f"Stop {j}: {stop['name']}"
                    if 'placeType' in stop and stop['placeType']:
                        place_type = stop['placeType'].replace('_', ' ')
                        response += f", which is a {place_type}"
                    response += ". "
                
                response += f"That's {len(day['stops'])} amazing places to explore!"
                
            else:
                response = f"I don't have information for day {day_number}. Your trip is {len(days)} days long."
        
        return response