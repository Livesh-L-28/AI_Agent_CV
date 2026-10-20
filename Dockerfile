# ==========================================
# Stage 1: Build React Frontend
# ==========================================
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ==========================================
# Stage 2: Production Python Runtime
# ==========================================
FROM python:3.12-slim AS runner

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

# Copy project metadata and install production dependencies
COPY pyproject.toml ./
RUN uv pip install --system --no-cache -e .

# Copy application code, database migrations, and pre-trained YOLO checkpoint
COPY src/ ./src/
COPY alembic/ ./alembic/
COPY alembic.ini ./
COPY scripts/ ./scripts/
COPY yolov8n.pt ./

# Copy built frontend assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Create storage directories with explicit permissions
RUN mkdir -p /app/data/evidence /app/data/uploads /app/data/fixtures

# Expose HTTP API & WebSocket port
EXPOSE 8000

# Container healthcheck against verified health endpoint
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Default command: launch production ASGI server with uvicorn
CMD ["uvicorn", "sentinel.api.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
