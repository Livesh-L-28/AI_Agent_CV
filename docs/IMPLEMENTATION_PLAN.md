# SENTINEL AI — Phased Implementation Plan

## Overview
This plan defines the step-by-step roadmap for developing SENTINEL AI. Each phase produces verifiable code, accompanying unit and integration tests, and updated status documentation.

---

## Phase Breakdown

### Phase 0: Repository and Environment Audit (CURRENT)
- **Objective:** Audit OS, hardware, Python, Node.js, Docker, databases, LLM engines, and workspace state.
- **Deliverables:**
  - `docs/ENVIRONMENT_AUDIT.md`
  - `docs/ARCHITECTURE.md`
  - `docs/IMPLEMENTATION_PLAN.md`
  - `docs/DECISIONS.md`
  - `docs/STATUS.md`
- **Verification:** Completed environment inspection commands and verified absence of uncommitted user changes.

### Phase 1: Project Skeleton, Configuration, Linting, and Test Suite
- **Objective:** Initialize Git, project directory structure, Python virtual environment, dependencies via `uv`, configuration management, and baseline test suite.
- **Deliverables:**
  - Git repository initialization and `.gitignore`
  - `pyproject.toml` and dependencies (FastAPI, Pydantic v2, SQLAlchemy, Alembic, OpenCV, Ultralytics, Shapely, Pytest)
  - `src/sentinel/config.py` (Pydantic `BaseSettings` with environment loading)
  - `src/sentinel/logging.py` (structured logging with correlation ID support)
  - `tests/test_config.py` and `tests/test_logging.py`
- **Verification:** `pytest` passes with 100% green tests.

### Phase 2: YOLO Model Adapter & Recorded-Video Inference
- **Objective:** Implement modular YOLO adapter supporting model loading, validation of class maps, device selection (CPU/MPS), inference latency tracking, and recorded video frame inference.
- **Deliverables:**
  - `src/sentinel/vision/adapter.py`: YOLOAdapter with validated class mapping
  - `src/sentinel/vision/geometry.py`: Bounding box normalization, intersection, scaling
  - `tests/fixtures/`: Synthetic test frames / small reference video clip
  - `tests/test_vision_adapter.py`: Tests for empty frame, invalid weights, coordinate math, inference latency
- **Verification:** Model loads cleanly, runs deterministic inference on test frame/video, outputs typed detections.

### Phase 3: Video Ingestion & Resource Lifecycle
- **Objective:** Implement unified video source abstractions supporting webcam input and recorded-video replay with thread safety and backpressure protection.
- **Deliverables:**
  - `src/sentinel/vision/sources/base.py`: Abstract `BaseVideoSource`
  - `src/sentinel/vision/sources/replay.py`: `VideoReplaySource` for deterministic automated tests
  - `src/sentinel/vision/sources/webcam.py`: `WebcamSource` with graceful error handling
  - `src/sentinel/vision/sources/buffer.py`: Ring buffer with backpressure drops
  - `tests/test_sources.py`: Tests for end-of-file, device unavailable, start/stop lifecycle
- **Verification:** Replay source correctly loops/terminates without thread or handle leaks.

### Phase 4: Tracking & Normalized Coordinate Utilities
- **Objective:** Integrate multi-object tracking (ByteTrack) to produce persistent track IDs across frames and calculate worker ground contact points.
- **Deliverables:**
  - `src/sentinel/vision/tracking.py`: Tracker adapter maintaining track IDs
  - `src/sentinel/vision/ground_contact.py`: Ground contact point estimator
  - `tests/test_tracking.py`: Tests for track association, ID persistence, occlusion handling
- **Verification:** Simulated multi-frame sequence preserves entity tracking IDs.

### Phase 5: Restricted-Zone & Temporal Event Engine
- **Objective:** Implement polygon zone evaluation (point-in-polygon) and temporal event candidate state machine with persistence and cooldowns.
- **Deliverables:**
  - `src/sentinel/rules/zones.py`: Polygon validation, PIP geometry using Shapely
  - `src/sentinel/rules/temporal_engine.py`: Event candidate generator with persistence filter
  - `tests/test_zones.py`: Polygon boundary, self-intersection, point-in-polygon tests
  - `tests/test_temporal_engine.py`: Persistence threshold and deduplication tests
- **Verification:** Worker walking into zone generates entry event only after persistence threshold; exits cleanly.

### Phase 6: PPE Model Integration & Association
- **Objective:** Integrate PPE detection adapter and person-to-PPE geometric/temporal association rules.
- **Deliverables:**
  - `src/sentinel/rules/ppe.py`: Person-to-helmet and person-to-vest association
  - `src/sentinel/vision/ppe_adapter.py`: Modular PPE detection interface
  - `tests/test_ppe.py`: Occlusion tests, missing detection tests, uncertain state representation
- **Verification:** Transient single-frame occlusion does not trigger false violation; sustained violation generates confirmed event candidate.

### Phase 7: Database Models, Migrations, and Repositories
- **Objective:** Implement async SQLAlchemy models, Alembic migrations, and repository pattern supporting SQLite and PostgreSQL.
- **Deliverables:**
  - `src/sentinel/db/models.py`: Declarative models (Sources, Detections, Events, Incidents, Evidence, AuditLog)
  - `src/sentinel/db/session.py`: Async engine and session factory
  - `src/sentinel/db/repositories/`: CRUD repositories
  - `alembic/`: Initial database migrations
  - `tests/test_db_repositories.py`: Async database CRUD tests
- **Verification:** Migrations run cleanly; repositories execute atomic transactions.

### Phase 8: FastAPI REST API & WebSocket Streaming
- **Objective:** Build modular FastAPI routers, Pydantic schemas, error handlers, and WebSocket live frame/event broadcaster.
- **Deliverables:**
  - `src/sentinel/api/`: Routers for `/sources`, `/events`, `/incidents`, `/analytics`, `/health`
  - `src/sentinel/api/stream.py`: WebSocket streaming endpoint
  - `tests/test_api.py`: FastAPI TestClient endpoint integration tests
- **Verification:** All endpoints return typed Pydantic responses and proper HTTP status codes.

### Phase 9: Stateful Agent Workflow & LLM Integration
- **Objective:** Implement multi-agent stateful workflow (Investigator, Policy Evaluator, Response Agent, Verification Agent) with local Ollama and mock fallback.
- **Deliverables:**
  - `src/sentinel/agents/state.py`: Typed shared state schemas
  - `src/sentinel/agents/providers/`: Ollama provider and mock provider
  - `src/sentinel/agents/workflow.py`: State graph execution engine
  - `tests/test_agent_workflow.py`: Agent step tests, schema validation, fallback on provider failure
- **Verification:** Agent workflow successfully investigates event, produces verified output, handles timeouts.

### Phase 10: Policy Gate, Tool Execution, and Verification
- **Objective:** Implement permission-checked allowlisted tools and deterministic policy gating.
- **Deliverables:**
  - `src/sentinel/agents/tools.py`: Allowlisted tools (`create_incident`, `send_alert`, etc.)
  - `src/sentinel/agents/policy_gate.py`: Deterministic safety rule gate
  - `tests/test_tools.py`: Tool permission checks, idempotency, verification engine tests
- **Verification:** Non-allowlisted tools rejected; duplicate notifications blocked by idempotency keys.

### Phase 11: React Dashboard & WebSocket UI
- **Objective:** Build industrial-grade React + TypeScript dashboard with live monitor, incident detail, agent trace, and zone editor.
- **Deliverables:**
  - `frontend/src/`: Vite React app with modular UI components
  - `frontend/src/pages/`: LiveMonitor, Incidents, AgentTrace, Analytics, Zones
  - `frontend/src/services/`: WebSocket client and REST API client
- **Verification:** Frontend builds cleanly (`npm run build`), connects to backend stream, renders live detections.

### Phase 12: Model and Agent Evaluation Suite
- **Objective:** Implement automated evaluation pipelines reporting detection mAP, tracking IDF1, event detection precision/recall, and agent grounding scores.
- **Deliverables:**
  - `scripts/evaluate_vision.py`: Vision benchmark runner
  - `scripts/evaluate_agents.py`: Agent benchmark runner
  - `docs/EVALUATION.md`: Verified benchmark report
- **Verification:** Reproducible evaluation commands execute and output structured JSON and markdown reports.

### Phase 13: Docker, CI/CD, Security, and Observability
- **Objective:** Create container definitions, GitHub Actions workflow, structured logging with correlation IDs, and security policies.
- **Deliverables:**
  - `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example`
  - `.github/workflows/ci.yml`: Automated lint, test, build pipeline
  - `docs/SECURITY.md`, `docs/DEPLOYMENT.md`
- **Verification:** CI workflow passes on simulated runner; container build succeeds.

### Phase 14: End-to-End Integration, Demo Fixtures, and Documentation
- **Objective:** Package the 5-minute recruiter demo script, end-to-end tests, demo data fixtures, and comprehensive documentation.
- **Deliverables:**
  - `tests/test_e2e.py`: End-to-end recorded video to verified incident pipeline test
  - `scripts/demo_runner.py`: Single-command 5-minute recruiter demonstration
  - `docs/DEMO_SCRIPT.md`, `README.md`
- **Verification:** Full end-to-end pipeline executes without manual intervention.
