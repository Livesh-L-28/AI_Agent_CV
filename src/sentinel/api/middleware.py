"""
FastAPI Middleware for Correlation IDs and Request Telemetry.
"""

import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from sentinel.logging import set_correlation_id, setup_logging

logger = setup_logging()


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """
    Extracts or generates an X-Correlation-ID header, binds it to the async context,
    and returns it in the response headers.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        cid = request.headers.get("X-Correlation-ID") or f"req_{uuid.uuid4().hex[:12]}"
        set_correlation_id(cid)

        start_time = time.perf_counter()
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        response.headers["X-Correlation-ID"] = cid
        response.headers["X-Process-Time-Ms"] = f"{duration_ms:.2f}"

        # Don't log health poll noise
        if not request.url.path.startswith("/health"):
            logger.info(
                f"{request.method} {request.url.path} -> {response.status_code} ({duration_ms:.1f}ms)"
            )

        return response
