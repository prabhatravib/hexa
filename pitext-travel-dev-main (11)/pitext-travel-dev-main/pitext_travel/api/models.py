"""Shared data structures for itinerary planning.

Moving the Stop dataclass out of llm.py / geocoding.py removes the
runtime circular import while still allowing both modules to share a
single source‑of‑truth definition for itinerary objects.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass
class Stop:
    """A single stop on a trip itinerary."""

    day: int  # 1‑based day index within the trip
    name: str  # e.g. "Eiffel Tower"
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

    def to_dict(self) -> dict:
        return {
            "day": self.day,
            "name": self.name,
            "address": self.address,
            "lat": self.lat,
            "lng": self.lng,
        }


# A trip itinerary is represented as a list of lists (one list per day)
# where each inner list contains Stop objects for that day.
Itinerary = list[list[Stop]]
