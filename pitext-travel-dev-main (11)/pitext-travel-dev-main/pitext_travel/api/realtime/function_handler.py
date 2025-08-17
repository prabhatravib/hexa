# pitext_travel/api/realtime/function_handler.py
"""Handle function calls from OpenAI Realtime API."""

import json
import logging
from typing import Dict, Any, Optional, Callable
from flask import session

from pitext_travel.api.llm import generate_trip_itinerary

logger = logging.getLogger(__name__)


class FunctionHandler:
    """Handles function calls from the Realtime API."""
    
    def __init__(self, flask_session_id: str):
        """Initialize function handler.
        
        Args:
            flask_session_id: Flask session ID for accessing session data
        """
        self.flask_session_id = flask_session_id
        
        # Function registry
        self.functions = {
            "plan_trip": self._handle_plan_trip,
            "explain_day": self._handle_explain_day
        }
        
    # Function definitions for Realtime API
        self.function_definitions = [
            {
                "type": "function",
                "name": "plan_trip",
                "description": "Plan a multi-day itinerary for a city. Use this when the user provides BOTH a city name AND number of days.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "city": {
                            "type": "string",
                            "description": "The city name for the trip"
                        },
                        "days": {
                            "type": "integer", 
                            "description": "Number of days for the trip",
                            "minimum": 1, 
                            "maximum": 14
                        }
                    },
                    "required": ["city", "days"]
                }
            },
            {
                "type": "function",
                "name": "explain_day",
                "description": "Explain the itinerary for a specific day or provide an overview of all days",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "day_number": {
                            "type": "integer",
                            "description": "The day number to explain (1-based), or 0 for overview",
                            "minimum": 0
                        }
                    },
                    "required": ["day_number"]
                }
            }
        ]    
        
    def handle_function_call(self, call_id: str, name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        """Handle a function call from the Realtime API.
        
        Args:
            call_id: Unique ID for this function call
            name: Function name
            arguments: Function arguments
            
        Returns:
            Function result to send back to Realtime API
        """
        logger.info(f"Handling function call: {name} with args {arguments}")
        
        try:
            if name not in self.functions:
                return {
                    "error": f"Unknown function: {name}",
                    "success": False
                }
            
            # Execute the function
            result = self.functions[name](arguments)
            
            # Add metadata
            result["call_id"] = call_id
            result["function"] = name
            
            return result
            
        except Exception as e:
            logger.error(f"Error executing function {name}: {e}")
            return {
                "error": str(e),
                "success": False,
                "call_id": call_id,
                "function": name
            }
    
    def _handle_plan_trip(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle the plan_trip function call.
        
        Args:
            args: Function arguments (city, days)
            
        Returns:
            Result with itinerary data
        """
        city = args.get("city")
        days = args.get("days")
        
        if not city or not days:
            return {
                "success": False,
                "error": "Missing required parameters: city and days"
            }
        try:
            # Generate itinerary using existing logic
            itinerary_data = generate_trip_itinerary(city, days)
            
            # Wrap the list in a proper dictionary structure
            itinerary = {
                'days': itinerary_data,
                'metadata': {
                    'city': city,
                    'days': days
                }
            }
            
            # The voice response is now handled by the frontend to avoid duplication
            return {
                "success": True,
                "itinerary": itinerary,
                "city": city,
                "days": days,
                "action": "render_map"
            }
        except Exception as e:
            logger.error(f"Failed to generate itinerary: {e}")
            return {
                "success": False,
                "error": f"Failed to generate itinerary: {str(e)}",
                "voice_response": f"I'm sorry, I couldn't create an itinerary for {city}. Please try again."
            }
    
    def _handle_explain_day(self, args: Dict[str, Any]) -> Dict[str, Any]:
        """Handle the explain_day function call.
        
        Args:
            args: Function arguments (day_number)
            
        Returns:
            Result with day explanation
        """
        day_number = args.get("day_number", 0)
        
        # This needs access to the current itinerary from session
        # For now, return a placeholder that the WebSocket handler will process
        
        return {
            "success": True,
            "action": "explain_day",
            "day_number": day_number,
            "needs_session_data": True,
            "voice_response_template": "explain_day_response"  # Template to fill with actual data
        }
    
    def get_function_definitions(self) -> list:
        """
        Return the tool list in the exact JSON shape the Realtime API expects.

        Each element must have top-level keys:
            - type:        always "function"
            - name:        the callable name (string)
            - description: short human-readable summary (string)
            - parameters:  JSON-Schema dict describing arguments (dict)

        Returns
        -------
        list
            List of tool objects ready to drop into `session.tools`.
        """
        return [
            {
                "type": "function",
                "name": d["name"],
                "description": d.get("description", ""),
                "parameters": d.get("parameters", {}),
            }
            for d in self.function_definitions
        ]
    
    def format_explain_day_response(self, itinerary: Dict[str, Any], 
                                  city: str, day_number: int) -> str:
        """Format the explain_day response with actual itinerary data.
        
        Args:
            itinerary: Current itinerary data
            city: City name
            day_number: Day to explain (0 for overview)
            
        Returns:
            Formatted voice response
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


def create_function_handler(flask_session_id: str) -> FunctionHandler:
    """Create a function handler instance.
    
    Args:
        flask_session_id: Flask session ID
        
    Returns:
        FunctionHandler instance
    """
    return FunctionHandler(flask_session_id)