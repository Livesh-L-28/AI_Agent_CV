"""
Pydantic API Request and Response Schemas.
Enforces strict input validation, serialization, and OpenAPI documentation types.
"""

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    correlation_id: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = "ok"
    version: str = "0.1.0"
    environment: str
    database_connected: bool
    timestamp: str


class SourceCreateRequest(BaseModel):
    source_id: str = Field(min_length=3, max_length=64, description="Unique source identifier")
    name: str = Field(min_length=3, max_length=128, description="Human readable name")
    source_type: str = Field(description="'replay', 'webcam', or 'upload'")
    uri: str = Field(description="File path or device index or stream URI")
    fps: float = Field(default=25.0, ge=1.0, le=120.0)


class SourceResponse(BaseModel):
    id: str
    name: str
    source_type: str
    uri: str
    status: str
    fps: float
    created_at: datetime


class EventResponse(BaseModel):
    id: str
    source_id: str
    track_id: int
    event_type: str
    severity: str
    zone_id: Optional[str] = None
    rule_id: str
    first_observation_ns: int
    last_observation_ns: int
    persistence_count: int
    confidence: float
    deduplication_key: str
    meta_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class IncidentReviewRequest(BaseModel):
    action: str = Field(description="'RESOLVE', 'DISMISS', or 'ESCALATE'")
    reviewer_name: str = Field(min_length=2, max_length=128)
    notes: Optional[str] = None


class IncidentResponse(BaseModel):
    id: str
    event_id: str
    title: str
    status: str
    severity: str
    assigned_to: Optional[str] = None
    resolution_notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class AnalyticsSummaryResponse(BaseModel):
    total_sources: int
    active_sources: int
    total_events: int
    total_incidents: int
    open_incidents: int
    critical_incidents: int


class VisionAnalyticsResponse(BaseModel):
    device: str
    average_latency_ms: float
    effective_fps: float
    frames_processed: int
    detected_persons: int
