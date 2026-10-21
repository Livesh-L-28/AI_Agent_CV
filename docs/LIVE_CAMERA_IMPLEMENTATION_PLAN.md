# SENTINEL AI — Live Camera & Enterprise Operations Implementation Plan

**Document Version:** 1.0.0  
**Date:** October 21, 2026  
**Author:** Principal Computer-Vision Engineer & Real-Time Video Streaming Architect  
**Repository:** `~/AI_Agent_CV`  
**Tracking Context:** Live Camera & Enterprise Operations Sprint (Phases 0 through 8)  

---

## 1. Phase 0 Audit & Architecture Discovery

### 1.1 Git Status & Baseline State
- **Current Branch:** `main` (commit `46f2602`).
- **Working Tree:** Contains verified Sprint 1 remediation work (server-trusted JWT auth, SHA-256 evidence verification, timestamp-aware temporal engine, honest telemetry provider, PPE capability guards, and planar homography).
- **Test Baseline:** 94 passed, 0 failed, 1 warning (deprecation notice in Starlette test client).
- **Preservation Policy:** All 37 modified files and 7 untracked Sprint 1 files will be strictly preserved without destructive git operations.

### 1.2 Discovered Interfaces & Current Execution Trace

```
Current Reality:
[DB VideoSource] --(POST /api/v1/sources/{id}/start)--> Status updated to "RUNNING" in DB ONLY
                                                            |
                                                            v
                                                  [NO WORKER TASK RUNNING]
                                                            |
                                                  [NO INFERENCE EXECUTED]
                                                            |
                                                  [NO FRAMES TRANSMITTED]

Target Architecture:
[Camera Sources]
  ├── USB / Local Webcam (OpenCV VideoCapture)
  ├── IP Camera (RTSP via OpenCV, credentials redacted, backoff retry)
  ├── Browser Webcam (WebRTC / Ingest API via MediaDevices getUserMedia)
  └── Recorded Replay (Deterministic VideoReplaySource)
         │
         ▼
[Camera Pipeline Worker (Isolated Task per Camera)]
  ├── Bounded Frame Buffer (Capacity 15, Drop-Oldest Backpressure)
  ├── Configurable Frame Sampling Rate (1..30)
  ├── YOLO Model Adapter (Reused Thread-Safe MPS/CUDA/CPU Inference)
  ├── Multi-Object Tracking & Ground-Contact Calculation
  ├── Temporal Rule Engine & PPE Validation Gate
  └── Metrics Accumulator (Rolling FPS, Latency, Queue Depth, Drops)
         │
         ├──► [Database: Detections & Verified Safety Events]
         ├──► [Stateful Multi-Agent Investigation & Policy Gate]
         └──► [Broadcaster / Gateway]
                 ├── WebSocket Telemetry & Bounding Box Overlays
                 └── Authenticated Low-Latency MJPEG Stream (GET /api/v1/cameras/{id}/live)
```

### 1.3 Identified Deficiencies & Architectural Gaps

1. **Missing Asynchronous Camera Manager:**
   - The backend lacks an in-memory Camera Pipeline Manager that coordinates the lifecycle of active video capture workers, manages threads/tasks, enforces concurrency bounds, and gracefully shuts down resources.
2. **Missing Live Stream Gateway for Browsers:**
   - Browsers cannot render RTSP URLs directly.
   - The platform has no endpoint serving live frames (e.g., authenticated MJPEG `multipart/x-mixed-replace` or binary WebSocket frame transmission).
3. **Missing Browser Webcam Ingestion:**
   - On macOS hosts, terminal processes often lack AVFoundation TCC permissions (`cv2.VideoCapture(0)` fails with `not authorized to capture video`).
   - Modern enterprise CV platforms allow browser-direct webcam streaming where the browser captures via `getUserMedia` and pushes frames to backend inference.
4. **Security & Credential Exposure Risks:**
   - RTSP URLs often embed basic authentication (`rtsp://user:pass@192.168.1.50/stream`).
   - If returned in `SourceResponse` or logged directly, passwords leak to the client or log files.
   - SSRF vulnerability: Unvalidated user-supplied camera URLs can target internal infrastructure (e.g. `http://169.254.169.254` AWS metadata or local localhost ports).
5. **Frontend LiveMonitor Disconnection:**
   - `LiveMonitor.tsx` only renders either an idle disconnected card or procedural HTML5 canvas simulation.
   - It needs real multi-camera selection, live video display, overlay coordinates aligned to video dimensions, and real-time telemetry.

---

## 2. Selected Streaming & Integration Strategy

### 2.1 Browser Streaming Protocol Decision

| Streaming Approach | Latency | Browser Support | Complexity & Dependencies | Evaluation |
|:---|:---:|:---:|:---:|:---|
| **Authenticated MJPEG (`multipart/x-mixed-replace`)** | **50–150 ms** | **100% Native (HTML5 `<img>`)** | **Zero extra infrastructure; native in FastAPI** | **SELECTED (Primary View)** |
| **WebSocket Frame + Telemetry Stream** | **40–100 ms** | **HTML5 Canvas / WebSocket** | **Reuses existing `/api/v1/stream` endpoint** | **SELECTED (Telemetry & Overlays)** |
| **MediaMTX WebRTC Gateway** | 100–300 ms | WebRTC PeerConnection | Requires separate external daemon, port forwarding, ICE/STUN/TURN | Evaluated; preserved as optional external Docker Compose service, not mandatory |
| **HLS (HTTP Live Streaming)** | 2–6 seconds | Safari native / HLS.js | High latency unsuitable for real-time safety interlock / monitoring | Rejected for real-time monitoring |

**Decision:**
- Primary live video playback is delivered via an authenticated, low-latency **MJPEG stream endpoint** (`GET /api/v1/cameras/{camera_id}/live?token=...`).
- Real-time telemetry, normalized bounding boxes, and instantaneous safety events are broadcast over the existing authenticated **WebSocket stream** (`/api/v1/stream`).
- This guarantees sub-150ms real-time monitoring with 100% native browser compatibility and zero third-party binary dependencies.

---

## 3. Detailed Sprint Phasing & Implementation Roadmap

### Phase 1: Camera Provider & Source Abstractions
- Create `CameraSource` abstraction extending `BaseVideoSource`:
  - `source_type`: `webcam`, `rtsp`, `browser_upload`, `replay`.
  - Rich health state machine: `CONNECTING`, `LIVE`, `STALE`, `RECONNECTING`, `DISABLED`, `ERROR`.
  - Reconnection policy: Exponential backoff with jitter (initial 1.0s, max 30.0s).
  - Explicit credential redaction: Strip user/password from logs and API payloads using regex masking (`rtsp://***:***@host:port/path`).
  - SSRF protection: Whitelist allowed schemes (`rtsp://`, `rtsps://`, `http://`, `https://`) and validate IP ranges (blocking loopback and cloud metadata endpoints unless explicitly allowed).
  - Hardware camera fallback: When hardware webcam is blocked by macOS TCC, enter clean `ERROR` with user-actionable instructions without crashing.
  - Browser webcam ingestion adapter: Ingest frames pushed via WebSocket or HTTP POST from client `getUserMedia`.

### Phase 2: Secure Camera Registry & Lifecycle Management
- Create `CameraManager` singleton:
  - Manages active camera workers (`CameraPipelineWorker`).
  - Limits max concurrent active streams (default: 4 concurrent streams).
  - Isolates camera workers so a network drop or crash on Camera A never disrupts Camera B.
  - Exposes thread-safe start, stop, restart, and health metrics.
- API Endpoints (`/api/v1/cameras`):
  - `POST /api/v1/cameras`: Register camera (ADMIN, SAFETY_OFFICER).
  - `GET /api/v1/cameras`: List registered cameras with sanitized URIs and live status (All authenticated roles).
  - `GET /api/v1/cameras/{id}`: Camera details and live metrics.
  - `POST /api/v1/cameras/{id}/start`: Start live ingestion and inference worker.
  - `POST /api/v1/cameras/{id}/stop`: Cleanly terminate worker and release capture handles.
  - `GET /api/v1/cameras/{id}/live`: Authenticated MJPEG video stream (JWT validated).
  - `POST /api/v1/cameras/{id}/ingest`: Browser webcam frame ingestion endpoint for web cameras.

### Phase 3: Live Inference Pipeline & Deterministic Safety Engine
- Pipeline worker loop (`CameraPipelineWorker`):
  - Ingests frames into `BoundedFrameBuffer` (capacity: 15 frames, drops oldest on backpressure).
  - Samples frames according to `frame_sampling_rate` (e.g. 1 out of every 2 frames).
  - Passes frames to shared `YOLOAdapter.infer()`.
  - Updates `MultiObjectTracker` with detected bboxes.
  - Computes ground contact and evaluates `TemporalEventEngine` + `PPERuleEngine`.
  - Emits real safety events to DB (`SafetyEventRepository`) and triggers multi-agent governance where applicable.
  - Updates `VisionMetricsProvider` with real FPS, inference latency, queue depth, and dropped frame counts.
  - Encodes live annotated frame to JPEG and caches latest frame for MJPEG stream consumers.

### Phase 4: Real-Time Frontend Upgrade (`LiveMonitor.tsx`)
- Implement:
  - Camera Selector Bar & Grid/Single-focus toggle.
  - Browser Webcam Toggle: Uses `navigator.mediaDevices.getUserMedia` to capture real local user webcam and stream frames to backend for live inference!
  - Connection status badge with pulse dot: `LIVE`, `CONNECTING`, `RECONNECTING`, `STALE`, `IDLE`.
  - Real video display using `<img src="/api/v1/cameras/{id}/live?token=..." />` with canvas overlay for normalized bounding boxes and zones.
  - Per-camera metrics overlay: FPS, latency, detected persons, dropped frames.
  - Clear Simulation vs Real Source indicator banners.
  - Accessible controls and responsive multi-camera layout.

### Phase 5: Multi-Camera Isolation & Resource Control
- Concurrency limiting with semaphore/lock to prevent MPS/CUDA memory contention.
- Independent worker tasks: Exception in one camera worker is caught, logged with correlation ID, and triggers backoff reconnect without taking down other cameras.
- Queue saturation and stale frame discard: If frame age > 500ms, frame is dropped to prevent delayed incident timestamps.
- Benchmarked capacity testing.

### Phase 6: Enterprise Incident Operations
- Enhanced filtering in Incident API: Filter by `camera_id`, `zone_id`, `severity`, `status`, and time range.
- Assignment lifecycle: Update incident assignee, investigation notes, and status changes with full audit logging.
- Deduplication: Prevent multiple identical open incidents for the same worker re-entering a zone within the cooldown period.

### Phase 7: Verification Suite
- Comprehensive automated test suite:
  - Camera registration, RBAC, and credential sanitization.
  - SSRF protection on RTSP URIs.
  - Camera worker start/stop lifecycle and clean resource release.
  - Bounded queue backpressure and frame dropping.
  - Browser webcam ingestion endpoint.
  - MJPEG streaming endpoint with token authentication.
  - Worker failure isolation.
  - Frontend typecheck and production build.

### Phase 8: Documentation & Reporting
- Deliver `docs/LIVE_CAMERA_IMPLEMENTATION_REPORT.md`.
- Update `docs/ARCHITECTURE.md`, `README.md`, and `docs/REMEDIATION_STATUS.md`.

---

## 4. Acceptance Criteria

1. At least one genuine real-time camera source (browser webcam capture or local RTSP/video test stream) feeds live frames into the backend YOLO pipeline.
2. Real frames traverse model inference, tracking, ground-contact calculation, and safety rules without synthetic injection.
3. The frontend displays the real video stream with synchronized bounding box overlays and honest status.
4. RTSP credentials are never exposed to the client or log files.
5. All 94 existing tests continue to pass with 0 regressions.
