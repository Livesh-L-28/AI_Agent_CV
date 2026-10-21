"""
Enterprise Camera Operations and Streaming API Router.
Handles camera registration, SSRF-guarded validation, lifecycle controls,
real-time browser frame ingestion, and authenticated MJPEG video streams.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from sentinel.api.schemas import (
    CameraMetricsResponse,
    CameraRegisterRequest,
    CameraResponse,
)
from sentinel.db.repositories.source_repo import SourceRepository
from sentinel.db.session import get_db_session
from sentinel.logging import setup_logging
from sentinel.security.auth import (
    AuthenticatedUser,
    UserRole,
    get_current_user_with_query,
    require_role,
)
from sentinel.vision.camera_manager import get_camera_manager
from sentinel.vision.sources.camera import (
    CameraConfig,
    CameraType,
)

logger = setup_logging()

router = APIRouter(prefix="/api/v1/cameras", tags=["Cameras"])


def _format_camera_response(config: CameraConfig) -> CameraResponse:
    manager = get_camera_manager()
    status_val = manager.get_camera_status(config.camera_id)
    metrics_val = manager.get_metrics(config.camera_id)

    return CameraResponse(
        camera_id=config.camera_id,
        name=config.name,
        camera_type=config.camera_type.value,
        sanitized_uri=config.sanitized_uri,
        sampling_rate=config.sampling_rate,
        target_fps=config.target_fps,
        site_id=config.site_id,
        zone_id=config.zone_id,
        enabled=config.enabled,
        status=status_val.value,
        metrics=CameraMetricsResponse(
            frames_read=metrics_val.frames_read,
            frames_processed=metrics_val.frames_processed,
            frames_dropped=metrics_val.frames_dropped,
            effective_fps=metrics_val.effective_fps,
            average_latency_ms=metrics_val.average_latency_ms,
            queue_depth=metrics_val.queue_depth,
            last_frame_age_seconds=metrics_val.last_frame_age_seconds,
            reconnect_count=metrics_val.reconnect_count,
            last_error_category=metrics_val.last_error_category,
        ),
    )


@router.post("", response_model=CameraResponse, status_code=status.HTTP_201_CREATED)
async def register_camera(
    payload: CameraRegisterRequest,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """
    Registers a new camera source with strict SSRF validation and credential redaction.
    Requires SAFETY_OFFICER or ADMIN role.
    """
    manager = get_camera_manager()
    existing = manager.get_camera(payload.camera_id)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Camera with ID '{payload.camera_id}' is already registered",
        )

    try:
        camera_type_enum = CameraType(payload.camera_type.lower())
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid camera_type '{payload.camera_type}'. Must be one of {[t.value for t in CameraType]}",
        )

    config = CameraConfig(
        camera_id=payload.camera_id,
        name=payload.name,
        camera_type=camera_type_enum,
        uri=payload.uri,
        sampling_rate=payload.sampling_rate,
        target_fps=payload.target_fps,
        site_id=payload.site_id,
        zone_id=payload.zone_id,
        enabled=payload.enabled,
    )

    try:
        registered = manager.register_camera(config)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Camera configuration rejected (SSRF or validation error): {e}",
        )

    # Persist camera source record in relational database
    async with get_db_session() as session:
        repo = SourceRepository(session)
        db_src = await repo.get_by_id(config.camera_id)
        if not db_src:
            await repo.create_source(
                source_id=config.camera_id,
                name=config.name,
                source_type=config.camera_type.value,
                uri=config.sanitized_uri,
                status="CREATED",
                fps=config.target_fps,
            )

    return _format_camera_response(registered)


@router.get("", response_model=list[CameraResponse])
async def list_cameras(
    user: AuthenticatedUser = Depends(
        require_role(UserRole.VIEWER, UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Lists all registered cameras with live status and metrics."""
    manager = get_camera_manager()
    return [_format_camera_response(cfg) for cfg in manager.list_cameras()]


@router.get("/{camera_id}", response_model=CameraResponse)
async def get_camera(
    camera_id: str,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.VIEWER, UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Retrieves operational details and live telemetry for a specific camera."""
    manager = get_camera_manager()
    config = manager.get_camera(camera_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{camera_id}' not found",
        )
    return _format_camera_response(config)


@router.post("/{camera_id}/start", response_model=CameraResponse)
async def start_camera(
    camera_id: str,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Starts live video ingestion and inference for the specified camera."""
    manager = get_camera_manager()
    config = manager.get_camera(camera_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{camera_id}' not found",
        )

    try:
        await manager.start_camera(camera_id)
    except ResourceWarning as rw:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=str(rw),
        )
    except Exception as e:
        logger.error(f"Failed to start camera '{camera_id}': {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to start camera: {e}",
        )

    async with get_db_session() as session:
        repo = SourceRepository(session)
        await repo.update_status(camera_id, "RUNNING")

    return _format_camera_response(config)


@router.post("/{camera_id}/stop", response_model=CameraResponse)
async def stop_camera(
    camera_id: str,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Halts live video ingestion and releases camera capture resources."""
    manager = get_camera_manager()
    config = manager.get_camera(camera_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{camera_id}' not found",
        )

    await manager.stop_camera(camera_id)

    async with get_db_session() as session:
        repo = SourceRepository(session)
        await repo.update_status(camera_id, "STOPPED")

    return _format_camera_response(config)


@router.get("/{camera_id}/live")
async def live_camera_stream(
    camera_id: str,
    max_frames: Optional[int] = None,
    user: AuthenticatedUser = Depends(get_current_user_with_query),
):
    """
    Delivers an authenticated low-latency MJPEG video stream (multipart/x-mixed-replace).
    Supports token verification via Authorization header or ?token= query parameter.
    Optional max_frames enables bounded stream inspection for tests and health probes.
    """
    manager = get_camera_manager()
    config = manager.get_camera(camera_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{camera_id}' not found",
        )

    return StreamingResponse(
        manager.stream_mjpeg(camera_id, max_frames=max_frames),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
            "X-Camera-ID": camera_id,
        },
    )


@router.post("/{camera_id}/ingest")
async def ingest_browser_frame(
    camera_id: str,
    request: Request,
    user: AuthenticatedUser = Depends(get_current_user_with_query),
):
    """
    Ingests live JPEG/PNG frames captured directly by the client browser (getUserMedia).
    Allows client webcam capture without local OS host camera privileges.
    """
    manager = get_camera_manager()
    body_bytes = await request.body()
    if not body_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Frame byte payload is empty",
        )

    success = manager.ingest_browser_frame(camera_id, body_bytes)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Failed to ingest frame for camera '{camera_id}'. Ensure source is started.",
        )

    return {"status": "ok", "camera_id": camera_id, "bytes_received": len(body_bytes)}


@router.get("/{camera_id}/metrics", response_model=CameraMetricsResponse)
async def get_camera_metrics(
    camera_id: str,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.VIEWER, UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Returns isolated operational metrics, frame rates, and latency for a camera."""
    manager = get_camera_manager()
    config = manager.get_camera(camera_id)
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera '{camera_id}' not found",
        )
    metrics_val = manager.get_metrics(camera_id)
    return CameraMetricsResponse(
        frames_read=metrics_val.frames_read,
        frames_processed=metrics_val.frames_processed,
        frames_dropped=metrics_val.frames_dropped,
        effective_fps=metrics_val.effective_fps,
        average_latency_ms=metrics_val.average_latency_ms,
        queue_depth=metrics_val.queue_depth,
        last_frame_age_seconds=metrics_val.last_frame_age_seconds,
        reconnect_count=metrics_val.reconnect_count,
        last_error_category=metrics_val.last_error_category,
    )
