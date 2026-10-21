"""
FastAPI Application Factory for SENTINEL AI.
Configures CORS, middleware, lifecycle events, and API routers.
"""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from sentinel.api.middleware import CorrelationIdMiddleware
from sentinel.api.routers import (
    agents,
    analytics,
    auth,
    cameras,
    events,
    health,
    incidents,
    sources,
    stream,
    twin,
)
from sentinel.api.schemas import ErrorResponse
from sentinel.config import get_settings
from sentinel.db.session import init_db
from sentinel.logging import get_correlation_id, setup_logging

logger = setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan context manager."""
    logger.info("Starting SENTINEL AI API Server...")
    settings = get_settings()
    settings.ensure_storage_dirs()

    # Ensure database schema is ready
    await init_db()
    logger.info("SENTINEL AI Backend is ready to serve requests.")

    # Auto-register and start default facility camera if fixture video exists
    fixture_video = Path("data/fixtures/synthetic_safety_video.mp4")
    if fixture_video.exists():
        try:
            from sentinel.vision.camera_manager import get_camera_manager
            from sentinel.vision.sources.camera import CameraConfig, CameraType

            cam_mgr = get_camera_manager()
            if not cam_mgr.get_camera("cam-facility-01"):
                default_cam = CameraConfig(
                    camera_id="cam-facility-01",
                    name="Assembly Line Overhead Cam 01",
                    camera_type=CameraType.REPLAY,
                    uri=str(fixture_video),
                    sampling_rate=1,
                    target_fps=25.0,
                )
                cam_mgr.register_camera(default_cam, allow_localhost=True)
                await cam_mgr.start_camera("cam-facility-01")
                logger.info("Auto-registered and started default camera 'cam-facility-01'")
        except Exception as e:
            logger.warning(f"Failed to auto-start default camera: {e}")

    yield

    logger.info("Shutting down SENTINEL AI API Server...")
    from sentinel.vision.camera_manager import get_camera_manager

    await get_camera_manager().shutdown_all()


def create_app() -> FastAPI:
    """Creates and configures the FastAPI application instance."""
    settings = get_settings()

    app = FastAPI(
        title="SENTINEL AI Platform API",
        version="0.1.0",
        description="Industrial Safety Monitoring API with Computer Vision, Temporal Rules, and Stateful AI Agents",
        lifespan=lifespan,
    )

    # CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins_list or ["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Correlation ID & Telemetry Middleware
    app.add_middleware(CorrelationIdMiddleware)

    # Ensure auth secrets are safe
    settings.validate_auth_secrets()

    # Register Routers
    app.include_router(auth.router)
    app.include_router(health.router)
    app.include_router(cameras.router)
    app.include_router(sources.router)
    app.include_router(events.router)
    app.include_router(incidents.router)
    app.include_router(agents.router)
    app.include_router(analytics.router)
    app.include_router(stream.router)
    app.include_router(twin.router)

    # Production static frontend mounting with SPA client-side routing fallback
    for candidate in [Path("frontend/dist"), Path("/app/frontend/dist")]:
        if candidate.is_dir():
            from fastapi.staticfiles import StaticFiles
            from fastapi.responses import FileResponse

            assets_dir = candidate / "assets"
            if assets_dir.is_dir():
                app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

            index_html = candidate / "index.html"

            @app.get("/{full_path:path}", include_in_schema=False)
            async def serve_spa(full_path: str):
                if full_path.startswith("api/") or full_path.startswith("health/"):
                    raise HTTPException(status_code=404, detail="API endpoint not found")
                target_file = candidate / full_path
                if full_path and target_file.is_file():
                    return FileResponse(target_file)
                if index_html.is_file():
                    return FileResponse(index_html)
                raise HTTPException(status_code=404, detail="Frontend asset not found")

            break

    # Exception Handlers
    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content=ErrorResponse(
                error=exc.detail if isinstance(exc.detail, str) else "HTTP Error",
                detail=str(exc.detail),
                correlation_id=get_correlation_id(),
            ).model_dump(),
            headers=exc.headers,
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception):
        logger.error(f"Unhandled server error: {exc}", exc_info=True)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=ErrorResponse(
                error="InternalServerError",
                detail="An internal server error occurred.",
                correlation_id=get_correlation_id(),
            ).model_dump(),
        )

    return app


app = create_app()
