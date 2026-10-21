"""
Pydantic API Request and Response Schemas.
Enforces strict input validation, serialization, and OpenAPI documentation types.
"""

from datetime import datetime, timezone
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


class CameraRegisterRequest(BaseModel):
    camera_id: str = Field(min_length=3, max_length=64, description="Unique camera identifier")
    name: str = Field(min_length=2, max_length=128, description="Human readable camera name")
    camera_type: str = Field(description="'webcam', 'rtsp', 'browser_webcam', or 'replay'")
    uri: str = Field(description="RTSP URI, webcam device index, or replay video file path")
    sampling_rate: int = Field(default=1, ge=1, le=30, description="Process 1 every N frames")
    target_fps: float = Field(default=25.0, ge=1.0, le=60.0)
    site_id: Optional[str] = None
    zone_id: Optional[str] = None
    enabled: bool = True


class CameraMetricsResponse(BaseModel):
    frames_read: int = 0
    frames_processed: int = 0
    frames_dropped: int = 0
    effective_fps: float = 0.0
    average_latency_ms: float = 0.0
    queue_depth: int = 0
    last_frame_age_seconds: float = 0.0
    reconnect_count: int = 0
    last_error_category: Optional[str] = None


class CameraResponse(BaseModel):
    camera_id: str
    name: str
    camera_type: str
    sanitized_uri: str
    sampling_rate: int
    target_fps: float
    site_id: Optional[str] = None
    zone_id: Optional[str] = None
    enabled: bool
    status: str
    metrics: CameraMetricsResponse


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
    status: str = "IDLE_NO_STREAM"
    average_latency_ms: float
    effective_fps: float
    frames_processed: int
    detected_persons: int


class EvidenceAssetResponse(BaseModel):
    id: str
    incident_id: Optional[str] = None
    asset_type: str
    sha256_hash: str
    byte_size: int
    mime_type: str
    created_at: datetime


class FloorLevel(BaseModel):
    id: str
    name: str
    level: int = 0
    elevation_meters: float = 0.0
    width_meters: float
    depth_meters: float


class EquipmentAsset(BaseModel):
    id: str
    name: str
    category: str  # CNC_MILL, ROBOTIC_CELL, CONVEYOR, RACK, FORKLIFT_BAY
    floor_id: str
    position: list[float]  # [x, y, z] in meters
    dimensions: list[float]  # [width, height, depth] in meters
    rotation_deg: float = 0.0
    status: str = "OPERATIONAL"


class WalkwayPath(BaseModel):
    id: str
    name: str
    floor_id: str
    points: list[list[float]]  # list of [x, z] coordinates
    width_meters: float = 2.0


class SpatialSafetyZone(BaseModel):
    zone_id: str
    name: str
    zone_type: str = "RESTRICTED"  # RESTRICTED, WARNING, SAFE
    floor_id: str = "floor-ground"
    polygon_meters: list[list[float]]  # 2D floor coordinates [x, z]
    height_meters: float = 3.0
    color_hex: str = "#EF4444"
    active_rules: list[str] = Field(default_factory=list)


class SpatialCameraNode(BaseModel):
    camera_id: str
    name: str
    floor_id: str = "floor-ground"
    position: list[float]  # [x, y, z]
    target: list[float] = Field(default_factory=lambda: [0.0, 0.0, 0.0])  # look-at target [x, y, z]
    height_meters: float = 4.5
    fov_horizontal_deg: float = 75.0
    calibrated: bool = False
    homography_matrix: Optional[list[list[float]]] = None  # 3x3 matrix
    coverage_polygon_meters: list[list[float]] = Field(default_factory=list)
    enabled: bool = True
    status: str = "OFFLINE"


class FactorySceneModel(BaseModel):
    schema_version: str = "1.0.0"
    factory_id: str
    name: str
    site_id: str
    dimensions: dict[str, float] = Field(
        default_factory=lambda: {"width_meters": 60.0, "depth_meters": 40.0, "height_meters": 10.0}
    )
    floors: list[FloorLevel] = Field(default_factory=list)
    equipment: list[EquipmentAsset] = Field(default_factory=list)
    walkways: list[WalkwayPath] = Field(default_factory=list)
    zones: list[SpatialSafetyZone] = Field(default_factory=list)
    cameras: list[SpatialCameraNode] = Field(default_factory=list)
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_by: str = "system"


class CameraCalibrationRequest(BaseModel):
    camera_id: str
    image_points: list[list[float]] = Field(description="At least 4 camera image points [[u, v], ...]")
    ground_points: list[list[float]] = Field(description="At least 4 metric floor points [[X, Y], ...]")


class CameraCalibrationResponse(BaseModel):
    camera_id: str
    calibrated: bool
    homography_matrix: list[list[float]]
    validation_status: str
    sample_projections: list[dict[str, Any]] = Field(default_factory=list)


class ReplayTimelineSnapshot(BaseModel):
    timestamp_ns: int
    camera_id: str
    active_tracks: list[dict[str, Any]]
    active_events: list[dict[str, Any]]
