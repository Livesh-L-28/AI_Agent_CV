# SENTINEL AI — Environment Audit Report

**Date:** 2026-10-20  
**Status:** Completed (Phase 0 Audit)  
**Host:** Darwin liveshs-MacBook-Pro.local 27.0.0 arm64  

---

## 1. Verified Environment Facts vs. Assumptions

| Component | Verified Fact | Source / Verification Command | Notes / Assumptions |
| :--- | :--- | :--- | :--- |
| **Operating System** | macOS 27.0.1 (Darwin 27.0.0 arm64) | `uname -a && sw_vers` | Apple Silicon architecture (`arm64`) |
| **CPU** | 8 logical cores | `sysctl -n hw.ncpu` | High-efficiency / high-performance hybrid |
| **System Memory** | 16.0 GB (17,179,869,184 bytes) | `sysctl -n hw.memsize` | Shared unified memory architecture |
| **Storage** | 254 GiB available (460 GiB total, 42% used) | `df -h .` | Sufficient for models, videos, dependencies |
| **Python** | Python 3.12.1 (`/Library/Frameworks/Python.framework/Versions/3.12/bin/python3`) | `python3 --version` | Python 3.12 standard compatibility |
| **Fast Package Manager** | `uv` is installed at `/Users/livesh/.local/bin/uv` | `which uv` | Recommended for fast, isolated `.venv` creation |
| **Global PyTorch** | PyTorch 2.14.1, Apple MPS: `True` | `python3 -c "import torch; print(torch.__version__, torch.backends.mps.is_available())"` | MPS acceleration is available; system will use CPU-first fallback |
| **Computer Vision Libs** | OpenCV and Ultralytics not in base Python | `python3 -c "import cv2, ultralytics"` (ModuleNotFoundError) | Must be installed in isolated project virtual environment |
| **Node.js & npm** | Node v20.15.1, npm 10.7.0 | `node -v && npm -v` | Fits modern React + TypeScript + Vite requirements |
| **Docker Engine** | Docker v29.7.2, Docker Compose v5.5.1 installed; Daemon NOT running | `docker ps` (`Cannot connect to the Docker daemon`) | Docker is installed but daemon needs to be launched or run natively |
| **Database** | `psql` installed at `/opt/homebrew/bin/psql`; server NOT running on 5432 | `pg_isready` (`/tmp:5432 - no response`) | Support SQLite for zero-setup local dev/test and PostgreSQL for staging/Docker |
| **LLM Provider (Local)** | Ollama running at `http://localhost:11434`; models available: `llama3.2:3b` (tools enabled), `openbiollm:latest` | `curl -s http://localhost:11434/api/tags` | Ready for agent reasoning with local Ollama or mock/fallback mode |
| **FFmpeg CLI** | Not installed globally (`which ffmpeg` -> not found) | `which ffmpeg` | OpenCV video I/O handles MP4 decoding/encoding; CLI tools optional |
| **Git Repository** | Git installed (`/usr/bin/git`); directory `/Users/livesh/AI_Agent_CV` is empty and uninitialized | `git status` -> `fatal: not a git repository` | Git initialization required in Phase 1 |

---

## 2. Resource Constraints & Execution Strategy

1. **Inference Backend:**
   - Default to CPU inference for maximum cross-platform reproducibility and CI/CD parity.
   - Automatically detect and utilize Apple Silicon `mps` when running locally if requested by config.
   - Use lightweight YOLO models (e.g. `yolov8n` or `yolo11n` ~6 MB) to keep latency low (<30ms on Apple Silicon CPU/MPS) and memory footprint under 500 MB.

2. **Database Strategy:**
   - Since PostgreSQL is not currently running as an active background service and Docker daemon is inactive, the persistence layer will use an explicit SQLAlchemy database abstraction supporting:
     - SQLite (`sqlite+aiosqlite:///./sentinel.db`) for immediate zero-dependency local runs and unit/integration testing.
     - PostgreSQL (`postgresql+asyncpg://...`) via standard connection strings for production and Docker Compose environments.
   - This ensures tests and local runs never fail due to an unstarted external daemon while maintaining strict SQL standards and Alembic migration compatibility.

3. **Agent & LLM Strategy:**
   - Primary agent provider: Local Ollama using `llama3.2:3b` at `http://localhost:11434`.
   - Secondary provider: Configurable OpenAI-compatible hosted endpoints via standard environment variables.
   - Offline / Degraded mode: Deterministic rule-based fallback and mock agent provider ensuring 100% of safety rules, detection, tracking, zone violations, and incident recording function with zero external network or LLM dependency.

4. **Video Ingestion & Hardware Constraints:**
   - Docker containers on macOS cannot access host webcams natively due to macOS AVFoundation sandboxing restrictions.
   - Therefore, **recorded-video replay (`VideoReplaySource`)** is designated as the primary reference implementation for reproducible automated testing, CI, and deterministic validation.
   - Live webcam input (`WebcamSource`) is fully supported for native macOS execution with graceful error handling when unavailable or denied permission.

---

## 3. Risks & Missing Dependencies

1. **Dependencies not yet installed in workspace:** Project needs a dedicated virtual environment with `fastapi`, `uvicorn`, `pydantic`, `sqlalchemy`, `alembic`, `ultralytics`, `opencv-python-headless`, `shapely`, `httpx`, `pytest`, `pytest-asyncio`.
2. **Docker daemon stopped:** Docker Compose integration tests will run natively first; Docker commands will be verified once the daemon is started.
3. **No Safety PPE Checkpoint:** A standard YOLO checkpoint (`yolov8n.pt` / COCO) detects `person`, but does not classify hardhats, vests, or goggles. We will implement:
   - Base person detector using standard verified weights.
   - Modular PPE classifier/detector adapter with explicit class mapping (`helmet`, `vest`, `no_helmet`, `no_vest`).
   - A dedicated synthetic/fixture PPE evaluator and association engine to test missing/uncertain PPE without misrepresenting COCO classes.
