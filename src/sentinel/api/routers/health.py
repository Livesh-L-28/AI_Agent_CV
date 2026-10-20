"""
Health and readiness probes for Kubernetes, Docker, and monitoring systems.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, status
from sqlalchemy import text

from sentinel.config import get_settings
from sentinel.db.session import get_engine

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("/live", status_code=status.HTTP_200_OK)
async def liveness_probe() -> dict:
    """Liveness probe confirming the HTTP server process is responsive."""
    return {"status": "live", "timestamp": datetime.now(timezone.utc).isoformat()}


@router.get("/ready", status_code=status.HTTP_200_OK)
async def readiness_probe() -> dict:
    """Readiness probe confirming database connectivity and operational readiness."""
    settings = get_settings()
    db_ok = False
    try:
        engine = get_engine()
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
            db_ok = True
    except Exception:
        db_ok = False

    return {
        "status": "ready" if db_ok else "degraded",
        "database_connected": db_ok,
        "environment": settings.environment,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
