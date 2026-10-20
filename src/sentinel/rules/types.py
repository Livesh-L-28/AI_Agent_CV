"""
Safety Rules and Event Engine Type Definitions
"""

import time
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field

from sentinel.vision.types import Detection


class EventType(str, Enum):
    ZONE_ENTRY = "ZONE_ENTRY"
    ZONE_EXIT = "ZONE_EXIT"
    ZONE_LOITERING = "ZONE_LOITERING"
    PPE_VIOLATION = "PPE_VIOLATION"
    UNSAFE_PROXIMITY = "UNSAFE_PROXIMITY"


class EventSeverity(str, Enum):
    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class SafetyEventCandidate(BaseModel):
    """
    Structured safety event candidate generated deterministically by the event engine.
    Passed to the multi-agent reasoning layer for investigation and response.
    """

    event_id: str
    event_type: EventType
    severity: EventSeverity
    source_id: str
    track_id: int
    zone_id: Optional[str] = None
    rule_id: str
    rule_version: str = "1.0.0"
    first_observation_ns: int
    last_observation_ns: int
    persistence_count: int
    confidence: float = Field(ge=0.0, le=1.0)
    deduplication_key: str
    uncertainty_reasons: list[str] = Field(default_factory=list)
    supporting_detections: list[Detection] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)

    @property
    def duration_seconds(self) -> float:
        return (self.last_observation_ns - self.first_observation_ns) / 1_000_000_000.0


def generate_event_id(prefix: str = "evt") -> str:
    """Generates a stable, timestamp-prefixed event identifier."""
    return f"{prefix}_{int(time.time_ns())}"
