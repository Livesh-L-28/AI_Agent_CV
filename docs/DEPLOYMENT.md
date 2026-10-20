# SENTINEL AI — Production Deployment Guide

## 1. Supported Deployment Topologies

SENTINEL AI supports three primary deployment architectures:

1. **Topology A: Single-Host Containerized Stack (Recommended for Production)**
   - Docker Compose orchestrating PostgreSQL 16 + SENTINEL AI unified container (FastAPI + React Dashboard).
   - Zero host environment pollution.
2. **Topology B: Edge Workstation / Developer Native**
   - Direct execution on macOS (with Apple MPS GPU acceleration) or Linux workstation via Python `.venv` and SQLite/PostgreSQL.
3. **Topology C: Industrial Edge Server with systemd**
   - Native Linux daemon for headless industrial gateway computers (Advantech, Siemens, Jetson).

---

## 2. Prerequisites & System Requirements

### Hardware Requirements
- **Minimum:** 4 CPU cores (x86_64 or arm64), 8 GB RAM, 10 GB disk space.
- **Recommended (Edge Real-Time):** Apple Silicon (M1/M2/M3/M4) or NVIDIA Jetson/RTX with $\ge 8$ GB unified/VRAM, 16 GB RAM.

### Software Prerequisites
- Docker Engine $\ge 24.0$ & Docker Compose v2.
- For Native Mode: Python 3.12+, Node.js 20 LTS, uv package manager.
- Optional: Local Ollama instance running `llama3.2:3b` (`ollama run llama3.2:3b`).

---

## 3. Production Container Deployment (Docker Compose)

### Step 1: Clone Repository and Prepare Environment

```bash
git clone https://github.com/organization/sentinel-ai.git
cd sentinel-ai

# Copy production environment template
cp .env.example .env
```

### Step 2: Configure Production Environment Variables

Edit `.env` for production values:

```ini
ENVIRONMENT=production
LOG_LEVEL=INFO

# PostgreSQL Connection String
DATABASE_URL=postgresql+asyncpg://sentinel:sentinel_secure_password@db:5432/sentinel_db

# Vision Model & Device Selection
YOLO_MODEL_PATH=yolov8n.pt
YOLO_DEVICE=cpu          # Use "cpu" for standard containers, "cuda" if nvidia-docker runtime is enabled
YOLO_CONFIDENCE_THRESHOLD=0.35

# Multi-Agent Configuration
LLM_PROVIDER=mock        # Use "mock" for zero-dependency CI/demo; "ollama" for live local LLM
OLLAMA_BASE_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.2:3b

# Server Binding
API_HOST=0.0.0.0
API_PORT=8000
ALLOWED_ORIGINS=http://localhost:8000,http://localhost:5173
```

### Step 3: Launch Services via Docker Compose

```bash
# Build unified multi-stage container and start services
docker compose up -d --build

# Verify container health and log streaming
docker compose ps
docker compose logs -f sentinel-api
```

The unified web dashboard and REST API are accessible at:
- **Web Dashboard & Live Monitor:** `http://localhost:8000`
- **Swagger Interactive API Documentation:** `http://localhost:8000/docs`
- **Health Check Endpoint:** `http://localhost:8000/api/v1/health`

---

## 4. Native Edge Workstation Deployment (macOS / Linux)

For edge installations requiring direct access to hardware acceleration (Apple MPS or physical USB webcams):

### Step 1: Environment Setup with `uv`

```bash
# Create isolated Python 3.12 virtual environment
uv venv .venv --python 3.12
source .venv/bin/activate

# Install all backend dependencies in editable mode
uv pip install -e ".[dev]"
```

### Step 2: Build React Dashboard Frontend

```bash
cd frontend
npm ci
npm run build
cd ..
```

### Step 3: Run Database Migrations

```bash
# Initialize schema via Alembic
alembic upgrade head
```

### Step 4: Start Backend Server

```bash
# Start FastAPI application with Uvicorn
uvicorn sentinel.api.app:app --host 0.0.0.0 --port 8000 --reload
```

---

## 5. Industrial Edge Daemon Deployment (systemd)

For headless industrial Linux servers, configure a dedicated systemd service unit:

Create `/etc/systemd/system/sentinel.service`:

```ini
[Unit]
Description=SENTINEL AI Industrial Safety Monitor
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=sentinel
Group=sentinel
WorkingDirectory=/opt/sentinel-ai
EnvironmentFile=/opt/sentinel-ai/.env
ExecStart=/opt/sentinel-ai/.venv/bin/uvicorn sentinel.api.app:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5s
LimitNOFILE=65536

# Security Hardening
PrivateTmp=true
ProtectSystem=full
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now sentinel.service
sudo systemctl status sentinel.service
```

---

## 6. Observability, Health Checking & Troubleshooting

### Health Check Endpoint
Query the active health endpoint for automated uptime monitoring (Kubernetes liveness/readiness probes):

```bash
curl -s http://localhost:8000/api/v1/health | jq .
```

Expected Response:
```json
{
  "status": "healthy",
  "database": "connected",
  "version": "0.1.0",
  "model_device": "mps",
  "model_loaded": true,
  "active_streams": 0
}
```

### Automated Backup & Migration Rollbacks

```bash
# Create schema migration snapshot
alembic revision --autogenerate -m "add_new_zone_fields"

# Rollback single migration step
alembic downgrade -1
```
