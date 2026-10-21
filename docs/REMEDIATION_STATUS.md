# SENTINEL AI — Remediation Status Tracker

**Document Version:** 1.0.0  
**Current Date:** October 21, 2026  
**Auditor / Engineer:** Principal Software Engineer (CV, Security, Agent Systems)  
**Tracking Context:** Sprint 1 Remediation of Release Audit Findings  

---

## Defect Remediation Summary Table

| Defect ID | Severity | Category | Description | Sprint Batch | Status | Verified By |
|:---|:---:|:---|:---|:---:|:---:|:---|
| **DEF-01** | P0 | Security | Total absence of server-trusted authentication & role verification across REST, WebSockets, and tools | 1A | **FIXED & TESTED** | `tests/test_auth_regression.py` (8/8 passing), `tests/test_api.py`, `tests/test_tools.py` |
| **DEF-07** | P1 | Integrity | Unverified evidence asset hashes on retrieval & missing audit on mismatch | 1B | **FIXED & TESTED** | `tests/test_evidence_integrity.py` (5/5 passing) |
| **DEF-04** | P1 | Correctness | Frame-count based persistence vulnerable to rate fluctuations and jitter | 1C | **FIXED & TESTED** | `tests/test_temporal_engine.py` (timestamp duration & anomaly tests) |
| **DEF-05** | P1 | Correctness | Single-frame track occlusion triggers premature violation auto-closure | 1C | **FIXED & TESTED** | `tests/test_temporal_engine.py` (occlusion grace & reacquisition tests) |
| **DEF-03** | P1 | Reliability | Silent injection of synthetic candidate into normal inference when 0 detections occur | 1D | **FIXED & TESTED** | `tests/test_e2e.py`, `tests/test_telemetry_honesty.py` |
| **DEF-06** | P1 | Telemetry | Hardcoded static metrics in `/api/v1/analytics/vision` | 1D | **FIXED & TESTED** | `tests/test_telemetry_honesty.py` (VisionMetricsProvider) |
| **DEF-10** | P2 | Frontend | LiveMonitor uses simulated HTML5 canvas loop instead of real stream state | 1D | **FIXED & TESTED** | `frontend/src/pages/LiveMonitor.tsx` (explicit demo toggle & honest idle screen) |
| **DEF-02** | P1 | Capability | COCO checkpoint lacks PPE classes; false-positive PPE violations | 1E | **FIXED & TESTED** | `src/sentinel/vision/adapter.py`, `src/sentinel/rules/ppe.py`, `tests/test_ppe.py` (7/7 passing), `/api/v1/analytics/capabilities` |
| **DEF-09** | P2 | API | Missing protected evidence asset download/export endpoint | 1F | **FIXED & TESTED** | `tests/test_evidence_integrity.py` |
| **DEF-08** | P2 | Geometry | Monocular bottom-center parallax distortion; lack of homography transformation | 1G | **FIXED & TESTED** | `src/sentinel/vision/geometry.py`, `tests/test_geometry.py` (8/8 passing), `docs/DATASET_AND_MODELS.md` |
| **DEF-11** | P3 | Deployment | Obsolete Docker Compose `version: '3.8'` attribute | 1G | **FIXED & TESTED** | `docker-compose.yml`, `docker compose config` validation, `.env.example` |
| **DEF-12** | P3 | Compliance | Unqualified OSHA compliance claims without certified advisory disclaimer | 1G | **FIXED & TESTED** | `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `README.md`, `frontend/src/App.tsx`, `frontend/src/pages/ZoneConfig.tsx` |

---

## Sprint Execution Log

### Sprint 1A: Authentication & Authorization (DEF-01)
- **Defects Addressed:** DEF-01 (P0).
- **Implementation:**
  - Implemented server-trusted JWT authentication in `src/sentinel/security/auth.py` with signed HS256 tokens, claims validation, role-based authorization (`VIEWER`, `SAFETY_OFFICER`, `ADMIN`), and denied-by-default access.
  - Secret safety gate in `src/sentinel/config.py` failing startup in staging/production if secrets are missing or unsafe.
  - Protected REST endpoints (`incidents`, `sources`, `events`, `agents`, `stream`) using FastAPI dependencies `get_current_user` and `require_role`.
  - Added token issuance route `POST /api/v1/auth/token` and identity inspection `GET /api/v1/auth/me`.
  - Bound user identity to agent tool execution in `src/sentinel/agents/tools.py` via `execute_tool(..., caller=user)`, blocking caller spoofing.
  - Protected WebSocket stream with query param / subprotocol token verification in `authenticate_websocket`.
- **Verification:** 8 regression tests in `tests/test_auth_regression.py` covering unauthenticated rejection, spoofed role neutralization, invalid/expired tokens, role privilege boundaries, WebSocket auth, and tool caller authorization.

### Sprint 1B & 1F: Evidence Integrity & Retrieval API (DEF-07, DEF-09)
- **Defects Addressed:** DEF-07 (P1), DEF-09 (P2).
- **Implementation:**
  - Re-implemented `EvidenceRepository.get_verified_asset_bytes()` in `src/sentinel/db/repositories/evidence_repo.py` with mandatory SHA-256 validation against stored digest before serving bytes.
  - Explicit error handling for missing assets (`EvidenceNotFoundError`), corrupted/tampered bytes (`EvidenceIntegrityError`), and cross-incident queries (`EvidenceCrossIncidentError`).
  - Audit logging of integrity violations to `AuditLogRepository`.
  - Added protected download endpoint `GET /api/v1/incidents/{incident_id}/evidence/{asset_id}/download` returning safe `Content-Disposition` attachments and media types without exposing raw filesystem paths.
- **Verification:** 5 regression tests in `tests/test_evidence_integrity.py` testing tampered bytes, missing files, cross-incident isolation, and download endpoint response.

### Sprint 1C: Temporal Event Correctness (DEF-04, DEF-05)
- **Defects Addressed:** DEF-04 (P1), DEF-05 (P1).
- **Implementation:**
  - Replaced frame-count-only persistence in `src/sentinel/rules/temporal_engine.py` with timestamp-aware duration logic (`persistence_duration_ns = 200_000_000` ns) coupled with minimum observation count.
  - Used source timestamps for recorded video replay and monotonic clock for real-time streams; never mixing clock domains.
  - Handled clock jitter, time-travel, and large stale gaps explicitly with gap resets.
  - Added occlusion grace window (`track_loss_grace_frames = 3`) preserving active incidents during brief tracking dropouts.
  - Track reacquisition prevents duplicate event emissions.
  - Added `close_source()` for clean video/source teardown without orphaned candidate state.
- **Verification:** 6 regression tests in `tests/test_temporal_engine.py` verifying rate fluctuations, dropped frames, occlusion recovery, duplicate prevention, and clean source shutdown.

### Sprint 1D: Honest Telemetry & Demonstration (DEF-03, DEF-06, DEF-10)
- **Defects Addressed:** DEF-03 (P1), DEF-06 (P1), DEF-10 (P2).
- **Implementation:**
  - Removed silent synthetic candidate injection from normal video inference when zero detections occur.
  - Separated normal inference from explicit simulation in `tests/test_e2e.py` and `scripts/demo_runner.py` with required `is_simulated: True` metadata.
  - Created `VisionMetricsProvider` in `src/sentinel/vision/metrics.py` dynamically measuring live inference latency, rolling FPS, and stream state.
  - Replaced hardcoded static metrics in `GET /api/v1/analytics/vision` with live metrics or honest `IDLE_NO_STREAM`.
  - Updated `frontend/src/pages/LiveMonitor.tsx` with an explicit Demo Simulation toggle and honest "Stream Disconnected / Offline" interface.
- **Verification:** 5 regression tests in `tests/test_telemetry_honesty.py` proving zero-detection videos emit zero incidents, simulated incidents carry explicit simulation flags, and metrics reflect real engine state.

### Sprint 1E: PPE Capability Integrity (DEF-02)
- **Defects Addressed:** DEF-02 (P1).
- **Implementation:**
  - Added `YOLOAdapter.get_capabilities()` in `src/sentinel/vision/adapter.py` programmatically introspecting checkpoint class names.
  - Added `ppe_capability_enabled` flag to `PPERuleEngine` (`src/sentinel/rules/ppe.py`). When running base COCO models lacking PPE classes (`helmet`, `vest`), PPE violation rule generation is suppressed to prevent 100% false-positive violations.
  - Added `GET /api/v1/analytics/capabilities` exposing model capabilities and supported/missing PPE classes.
  - Documented fine-tuned PPE model configuration via `YOLO_MODEL_PATH` in `docs/DATASET_AND_MODELS.md`.
- **Verification:** 7 tests in `tests/test_ppe.py` confirming class introspection, disabled PPE rules on COCO models, and synthetic test fixture isolation.

### Sprint 1G: Spatial Calibration & Documentation Polish (DEF-08, DEF-11, DEF-12)
- **Defects Addressed:** DEF-08 (P2), DEF-11 (P3), DEF-12 (P3).
- **Implementation:**
  - Added `PlanarHomography` in `src/sentinel/vision/geometry.py` with correspondence validation ($\ge 4$ points, non-collinear checks, non-singular determinant, forward/inverse projections).
  - Documented physical limitations of monocular bottom-center ground contact (perspective parallax, foot occlusion, non-upright postures, elevation shifts) in `src/sentinel/vision/ground_contact.py` and `docs/DATASET_AND_MODELS.md`.
  - Removed obsolete `version: '3.8'` from `docker-compose.yml`, verified with `docker compose config`, and added `SENTINEL_JWT_SECRET_KEY` configuration.
  - Added prominent Safety Advisory & Legal Disclaimers across `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`, `README.md`, and UI footer, explicitly stating that SENTINEL AI is an advisory monitoring prototype and not certified for life-safety interlocks or OSHA certification.
- **Verification:** 8 unit tests in `tests/test_geometry.py` passing, Docker compose validated, frontend build passing.

### Sprint 2: Genuine Live Camera & Multi-Camera Edge Operations (CAM-01 - CAM-07)
- **Capabilities Delivered:**
  - **CAM-01 (Source Abstractions):** Implemented `CameraPipelineWorker`, `RTSPCameraSource` (socket timeout, exponential backoff with jitter), `BrowserWebcamSource` (JPEG buffer ingestion), and `VideoReplaySource`.
  - **CAM-02 (Security & Redaction):** `sanitize_camera_uri()` masks RTSP credentials in schemas/logs; `validate_camera_uri()` enforces SSRF protections (blocking AWS/GCP/Azure link-local metadata `169.254.169.254`, directory traversal, and non-RTSP schemes).
  - **CAM-03 (Authenticated Streaming):** Implemented native low-latency MJPEG stream `/api/v1/cameras/{id}/live?token=...` with token query parameter authentication and synchronized WebSocket HUD telemetry.
  - **CAM-04 (Multi-Camera Isolation & Concurrency):** Enforced `max_concurrent_streams = 4` with HTTP 429 Too Many Requests response; guarded model inference via `asyncio.Semaphore(2)`.
  - **CAM-05 (Browser LiveMonitor Operations):** Multi-camera facility grid (2x2) and single focus view, direct laptop webcam ingestion (`getUserMedia`), and explicit simulation isolation.
  - **CAM-06 (Enterprise Incident Filtering):** Extended `IncidentRepository` and `/api/v1/incidents` with multi-dimensional filtering by `camera_id`, `zone_id`, `severity`, and `status`, plus `ACKNOWLEDGE` lifecycle transition.
- **Verification:** 7 regression tests in `tests/test_live_camera.py` (all passing), 101/101 total test suite pass rate.

