# ==============================================================================
# SENTINEL AI — Unified Production Container (FastAPI + React 3D SPA)
# ==============================================================================
FROM python:3.12-slim

# Prevent Python from writing .pyc and enable unbuffered output
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install minimal OS dependencies for OpenCV, networking, and healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libgomp1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv for ultra-fast deterministic Python package management
RUN pip install --no-cache-dir uv

# Copy project metadata, README, and source code before building/installing package
COPY pyproject.toml README.md ./
COPY src/ ./src/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY scripts/ ./scripts/
COPY yolov8n.pt ./
COPY data/fixtures/ ./data/fixtures/
COPY frontend/dist/ ./frontend/dist/

# Install application and production dependencies with PyTorch CPU wheels to minimize image size
RUN uv pip install --system --no-cache --extra-index-url https://download.pytorch.org/whl/cpu .

# Create storage directories with explicit permissions
RUN mkdir -p /app/data/evidence /app/data/uploads /app/data/fixtures

# Expose HTTP API & WebSocket port (Render dynamically sets $PORT, default 10000 on Render)
ENV PORT=10000
EXPOSE 10000

# Container healthcheck against verified health/readiness endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT:-10000}/health/ready || exit 1

# Default command: launch production ASGI server with uvicorn respecting $PORT
CMD ["sh", "-c", "uvicorn sentinel.api.app:app --host 0.0.0.0 --port ${PORT:-10000} --workers 1"]
