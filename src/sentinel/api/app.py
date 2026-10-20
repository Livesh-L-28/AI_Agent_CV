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
    events,
    health,
    incidents,
    sources,
    stream,
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

    yield

    logger.info("Shutting down SENTINEL AI API Server...")


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

    # Register Routers
    app.include_router(health.router)
    app.include_router(sources.router)
    app.include_router(events.router)
    app.include_router(incidents.router)
    app.include_router(agents.router)
    app.include_router(analytics.router)
    app.include_router(stream.router)

    # Optional static dashboard mounting for production deployment
    for candidate in [Path("frontend/dist"), Path("/app/frontend/dist")]:
        if candidate.is_dir():
            from fastapi.staticfiles import StaticFiles

            app.mount("/", StaticFiles(directory=str(candidate), html=True), name="frontend")
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
