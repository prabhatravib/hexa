"""LLM helper functions for PiText‑Travel.

Generates itineraries via OpenAI Chat Completions and augments them with
Google Maps coordinates.  This version removes the dependency on
``get_openai_model_name()`` to avoid the runtime import error reported
during deployment.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List

from pitext_travel.api.config import get_openai_api_key
from pitext_travel.api.geocoding import enhance_itinerary_with_geocoding, get_coordinates_for_place

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# OpenAI client initialisation
# ---------------------------------------------------------------------------

# Allow overriding the chat model from the environment; fall back to a safe
# default so that the service can still start without extra configuration.
CHAT_MODEL_NAME = os.getenv("OPENAI_CHAT_MODEL", "gpt-4.1")

# Initialize OpenAI client with error handling
try:
    from openai import OpenAI
    api_key = get_openai_api_key()
    client = OpenAI(api_key=api_key)
    logger.info("OpenAI client initialized successfully")
except Exception as e:
    logger.warning(f"Failed to initialize OpenAI client: {e}")
    client = None

# ---------------------------------------------------------------------------
# Prompt construction helpers
# ---------------------------------------------------------------------------

def _build_prompt(city: str, days: int) -> str:
    return (
        "You are a helpful travel planner. "
        f"Create a {days}-day itinerary for {city}. "
        "All attractions and stops must be located  near the {city}. Do not include any stops outside of the country of the city. "
        "Reply in strict JSON with the schema: "
        "{\n  \"days\": [\n    {\n      \"day\": <int>, \"stops\": [\n        {\n          \"name\": <str>, \"address\": <str|null>, \"lat\": null, \"lng\": null\n        }\n      ]\n    }\n  ]\n}"
    )


def _parse_response(content: str) -> List[Dict[str, Any]]:
    """Extract the itinerary list from the model's raw JSON string."""
    try:
        payload = json.loads(content)
        return payload["days"]
    except (json.JSONDecodeError, KeyError) as exc:
        logger.error("Failed to parse LLM response: %s", exc)
        raise


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_trip_itinerary(city: str, days: int) -> List[Dict[str, Any]]:
    """Return a list-of‑days itinerary enriched with geocoding data."""
    
    if client is None:
        raise RuntimeError("OpenAI client not available. Please check your OPENAI_API_KEY environment variable.")

    messages: List[Dict[str, str]] = [
        {"role": "system", "content": "You are ChatGPT."},
        {"role": "user", "content": _build_prompt(city, days)},
    ]

    logger.debug(
        "Calling OpenAI ChatCompletion: model=%s city=%s days=%d",
        'gpt-4.1',
        city,
        days,
    )

    response = client.chat.completions.create(
        model='gpt-4.1',
        messages=messages,  # type: ignore
        temperature=0.2,
        max_tokens=2048,
    )

    raw_content: str = response.choices[0].message.content or ""
    itinerary = _parse_response(raw_content)

    # Get city coordinates for better place search
    city_coords = get_coordinates_for_place(city)
    city_lat = None
    city_lng = None
    
    if city_coords:
        city_lat, city_lng = city_coords
        logger.info(f"Using city coordinates for {city}: {city_lat}, {city_lng}")
    else:
        logger.warning(f"Could not get coordinates for city: {city}")

    # Use enhanced city-scoped geocoding
    return enhance_itinerary_with_geocoding(itinerary, city=city, city_lat=city_lat, city_lng=city_lng)
