# pitext_travel/api/services/voice_service.py
"""Service layer for voice interaction functionality."""

import logging
from typing import Dict, Any, Optional, List
from datetime import datetime

logger = logging.getLogger(__name__)


class VoiceService:
    """Handles voice-specific business logic and formatting."""
    
    @staticmethod
    def format_voice_greeting(has_itinerary: bool = False, 
                            city: str = None, 
                            days: int = None) -> str:
        """Generate appropriate greeting for voice interaction.
        
        Args:
            has_itinerary: Whether an itinerary is already loaded
            city: Current city if available
            days: Number of days if available
            
        Returns:
            Formatted greeting message
        """
        if has_itinerary and city and days:
            return (f"Great! I can see your {days}-day itinerary for {city} "
                   f"is displayed on the map. How can I help you with your trip planning?")
        else:
            return ("Hi! I'm ready to help you plan your trip. Just tell me which "
                   "city you'd like to visit and for how many days.")
    
    @staticmethod
    def format_voice_error(error_type: str, details: str = "") -> str:
        """Format error messages for voice output.
        
        Args:
            error_type: Type of error
            details: Additional details
            
        Returns:
            User-friendly error message
        """
        error_messages = {
            "no_city": "I didn't catch the city name. Could you please tell me which city you'd like to visit?",
            "no_days": "How many days would you like to spend there?",
            "invalid_days": "Please tell me a number of days between 1 and 14.",
            "generation_failed": f"I'm sorry, I couldn't create an itinerary. {details}",
            "connection_lost": "I've lost the connection. Please click the microphone button to reconnect.",
            "no_itinerary": "I don't have a current itinerary. Would you like me to plan a trip first?",
            "unknown": "I'm sorry, something went wrong. Please try again."
        }
        
        return error_messages.get(error_type, error_messages["unknown"])
    
    @staticmethod
    def parse_voice_duration(text: str) -> Optional[int]:
        """Parse duration from voice input.
        
        Args:
            text: Voice input text
            
        Returns:
            Number of days or None if not found
        """
        # Common duration patterns
        duration_map = {
            "a day": 1,
            "one day": 1,
            "1 day": 1,
            "two days": 2,
            "2 days": 2,
            "three days": 3,
            "3 days": 3,
            "four days": 4,
            "4 days": 4,
            "five days": 5,
            "5 days": 5,
            "a week": 7,
            "one week": 7,
            "weekend": 2,
            "long weekend": 3,
            "extended weekend": 4,
            "fortnight": 14,
            "two weeks": 14
        }
        
        text_lower = text.lower()
        
        # Check for mapped durations
        for phrase, days in duration_map.items():
            if phrase in text_lower:
                return days
        
        # Try to extract numbers
        import re
        numbers = re.findall(r'\b(\d+)\b', text)
        if numbers:
            num = int(numbers[0])
            if 1 <= num <= 14:
                return num
        
        return None
    
    @staticmethod
    def format_confirmation(action: str, **kwargs) -> str:
        """Format confirmation messages for voice output.
        
        Args:
            action: Action being confirmed
            **kwargs: Action-specific parameters
            
        Returns:
            Formatted confirmation message
        """
        confirmations = {
            "trip_planned": "Perfect! I've created your {days}-day itinerary for {city}. You can see it on the map.",
            "day_selected": "Now showing day {day} of your trip.",
            "cleared": "I've cleared the map. Ready to plan a new trip!",
            "listening": "I'm listening. Go ahead!",
            "processing": "Let me process that for you..."
        }
        
        template = confirmations.get(action, "Done!")
        
        try:
            return template.format(**kwargs)
        except KeyError:
            logger.warning(f"Missing parameters for confirmation: {action}")
            return template
    
    @staticmethod
    def get_voice_tips() -> List[str]:
        """Get helpful voice interaction tips.
        
        Returns:
            List of voice command examples
        """
        return [
            "Plan a 3-day trip to Paris",
            "Show me day 2",
            "Explain the first day",
            "Give me an overview",
            "Plan a weekend in Tokyo",
            "Clear the map"
        ]
    
    @staticmethod
    def format_day_transition(from_day: int, to_day: int, total_days: int) -> str:
        """Format message for day transitions.
        
        Args:
            from_day: Previous day (0-based)
            to_day: New day (0-based)
            total_days: Total number of days
            
        Returns:
            Formatted transition message
        """
        # Convert to 1-based for user display
        display_day = to_day + 1
        
        if to_day == 0:
            return f"Showing day 1 of your {total_days}-day trip."
        elif to_day == total_days - 1:
            return f"Here's the final day, day {display_day} of your trip."
        else:
            return f"Now showing day {display_day} of {total_days}."
    
    @staticmethod
    def estimate_speaking_duration(text: str) -> float:
        """Estimate how long it will take to speak text.
        
        Args:
            text: Text to be spoken
            
        Returns:
            Estimated duration in seconds
        """
        # Average speaking rate is ~150 words per minute
        words = len(text.split())
        return max(1.0, (words / 150.0) * 60)


# Export for use in other modules
__all__ = ['VoiceService']