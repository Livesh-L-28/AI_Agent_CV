# SENTINEL AI — Enterprise Edge Architecture Roadmap & Implementation Plan

**Author:** Principal Software Architect, Computer Vision Engineer, Real-Time Streaming Engineer, Security Engineer, and SRE  
**Date:** October 2026  
**Status:** Approved Architecture Plan — Phase 0 Exit Gate Passed  
**Repository Baseline:** `~/AI_Agent_CV` (`main` @ `46f2602`)  
**Baseline Test Verification:** 101 passed, 0 failures, 1 deprecation warning (`pytest -v`)  
**Static Analysis & Production Build:** `ruff check src/ tests/` (Passed), `npm run build` (Passed in 906ms)

---

## 1. Executive Summary & Program Objectives

SENTINEL AI is evolving from a single-stream prototype into an enterprise industrial edge vision platform capable of continuous, multi-camera operations (2–10 cameras per edge node). The system combines:

1. **Deterministic Edge Safety Gates:** Timestamp-aware temporal rule engines, restricted zone spatial containment, and strict anatomical PPE association where verified models are available.
2. **Real Multi-Camera Ingestion:** Hardware webcam, browser `getUserMedia` frame pushing, IP camera RTSP with credentials isolated server-side, and deterministic video replay.
3. **Low-Latency Edge Streaming:** Native authenticated MJPEG (`multipart/x-mixed-replace`) with token authentication and synchronized WebSocket telemetry HUD for zero-daemon browser playback (<150ms latency).
4. **Resilient Edge Isolation:** Bounded backpressure buffers, per-camera worker failure domain isolation, and hardware-guarded inference concurrency.
5. **Tamper-Evident Evidence & Governance:** Cryptographic SHA-256 evidence hashing, cross-incident authorization fences, auditable lifecycle transitions, and human-in-the-loop investigation workflows.
6. **Ground-Truth Advisory Agents:** Strict allowlisted tool execution, identity-validated RBAC, and evidence-grounded incident summarization.

---

## 2. Current Architecture & Discovered Gaps

### 2.1 Trace of Execution Path (Current State)

```mermaid
flowchart LR
    A[Camera Source: RTSP / Browser / Replay] --> B[CameraPipelineWorker & BoundedFrameBuffer]
    B --> C[YOLOAdapter: Apple MPS / CUDA / CPU]
    C --> D[MultiObjectTracker: ByteTrack-style Kalman/IoU]
    D --> E[TemporalEventEngine & ZoneManager]
    E --> F[IncidentRepo & EvidenceRepo: SHA-256]
    F --> G[WebSocket Broadcast /stream/ws]
    B --> H[Live MJPEG Stream: /cameras/id/live]
    G --> I[React Frontend: LiveMonitor HUD]
    H --> I
```

### 2.2 Discovered Gaps & Remediation Status

| Subsystem | Audit Finding & Gap | Architectural Remediation |
|---|---|---|
| **Video Ingestion** | Previous `start_source` only updated DB state; no background capture worker existed. `LiveMonitor.tsx` only had a synthetic simulation loop. | Implemented `CameraPipelineWorker` with `BoundedFrameBuffer`, `BrowserWebcamSource`, `RTSPCameraSource`, and `VideoReplaySource`. |
| **Credential Exposure** | RTSP URLs with `rtsp://user:pass@host` could leak in API payloads, logs, or exceptions. | Regex sanitization `sanitize_camera_uri()` masks credentials as `rtsp://***:***@...` in DB schemas, logs, and API models. |
| **Network Security (SSRF)** | User-configured RTSP URIs could probe cloud metadata (`169.254.169.254`) or internal services. | Implemented `validate_camera_uri()` blocking link-local IPs, cloud metadata domains, non-RTSP schemes, and directory traversal. |
| **Browser Compatibility** | Browsers cannot play RTSP directly. Heavy external gateways (MediaMTX) add deployment complexity. | Implemented dual-path approach: native authenticated MJPEG for video + WebSocket for telemetry overlays. MediaMTX remains an optional external add-on. |
| **Multi-Camera Isolation** | Uncaught exceptions in camera capture could crash the shared server process or starve GPU resources. | Isolated `asyncio.Task` per camera worker; inference protected by `asyncio.Semaphore(max_concurrent=2)` to prevent GPU thrashing. |
| **PPE Label Rigor** | COCO base models (`yolov8n.pt`) do not have hardhat or vest classes. | `YOLOAdapter.get_capabilities()` introspects model class names; base COCO models automatically disable PPE violation generation (`has_ppe_classes=False`). |
| **Spatial Uncertainty** | Ground contact points from 2D bounding box bases are subject to monocular parallax, foot occlusion, and non-upright postures. | Documented explicit geometric limitations in `ground_contact.py` and require homography calibration for metric distance calculations. |

---

## 3. Preserved Abstractions & Core Interfaces

The following existing, tested abstractions are preserved without regressions:

1. **`src/sentinel/security/auth.py`:**
   - Cryptographic JWT verification, `UserRole` (`VIEWER`, `SAFETY_OFFICER`, `ADMIN`), and RBAC dependencies (`require_role`).
   - Extended with `get_current_user_with_query` to support `?token=` parameter for HTML5 media elements (`<img>`).
2. **`src/sentinel/rules/temporal_engine.py`:**
   - `TemporalEventEngine` tracking persistence thresholds (`persistence_threshold=5`), exit thresholds (`exit_threshold=3`), and tracking loss grace frames (`track_loss_grace_frames=3`).
3. **`src/sentinel/rules/ppe.py`:**
   - `PPEAssociationEngine` with anatomical torso/head region association and temporal evidence accumulation.
4. **`src/sentinel/db/repositories/evidence_repo.py`:**
   - `EvidenceRepository` with SHA-256 digest calculation, cross-incident authorization verification, and tampered evidence rejection (`EvidenceIntegrityError`).
5. **`src/sentinel/agents/policy_gate.py` & `tools.py`:**
   - Explicit `ALLOWLISTED_TOOLS`, role verification per tool, and deterministic policy boundaries blocking unverified autonomous actions.

---

## 4. Component Boundaries & Streaming Architecture Trade-Offs

### 4.1 Evaluation of Streaming Approaches

| Strategy | Protocol | Latency | Browser Support | Complexity | Decision |
|---|---|---|---|---|---|
| **Authenticated MJPEG + WebSocket** | HTTP Multipart + WS | **<150 ms** | **100% Native HTML5 (`<img>`)** | **Zero external dependencies** | **PRIMARY DEFAULT:** Immediate, reliable, low-overhead edge streaming. |
| **MediaMTX Gateway (WebRTC / WHEP)** | WebRTC | <200 ms | Modern Browsers | Requires separate container, ICE/STUN/TURN, UDP port ranges | **OPTIONAL EXTENSION:** For large-scale distributed deployments. |
| **HLS (HTTP Live Streaming)** | HLS (m3u8/ts) | 2–6 sec | Native Safari / hls.js | Moderate (segmentation disk churn) | **UNACCEPTABLE FOR REAL-TIME SAFETY:** Latency too high for prompt collision or intrusion avoidance. |
| **Direct RTSP to Browser** | RTSP / RTP | N/A | Unsupported in browsers | Impossible without client plugins | **REJECTED:** Direct browser RTSP is non-standard. |

---

## 5. Security & Privacy Threat Model

### 5.1 Threat Vectors & Edge Mitigations

| Threat | Risk Level | Mitigation Architecture |
|---|---|---|
| **Server-Side Request Forgery (SSRF)** | Critical | `validate_camera_uri()` restricts schemes to `rtsp://`, `rtsps://`, `webcam://`, `browser://`, `replay://`. Link-local IP addresses (`169.254.0.0/16`), AWS/GCP/Azure metadata endpoints, and directory traversal paths are rejected with HTTP 400. |
| **Credential Leakage in Video URLs** | High | Credentials embedded in RTSP URLs are stripped from API responses and database queries via `sanitize_camera_uri()`. Passwords never appear in client logs, DOM attributes, or WebSocket frames. |
| **Unauthorized Stream Access** | High | All camera endpoints (`/live`, `/metrics`, `/start`, `/stop`) enforce JWT verification. Media tags authenticate using short-lived tokens via `?token=` parameter validated against RBAC rules. |
| **Denial of Service (Resource Exhaustion)** | High | Edge concurrency limit enforced via `max_concurrent_streams = 4` (configurable). Excess camera start requests receive HTTP 429 Too Many Requests. Bounded frame queues drop oldest frames when processing falls behind. |
| **Cross-Incident Evidence Tampering** | Critical | Evidence assets are linked to immutable incident records. Retrievals verify SHA-256 hashes against stored digests; mismatched hashes trigger audit alerts and 409 Conflict. |

---

## 6. Edge Resource Constraints & Benchmarking Methodology

### 6.1 Hardware Targets

* **Apple Silicon Edge (M-series, MPS):** 4–8 concurrent camera streams at 15–25 FPS (YOLOv8n / YOLOv8s).
* **NVIDIA Jetson / Linux Edge (CUDA / TensorRT):** 4–10 concurrent camera streams.
* **x86 Industrial PC (CPU Only):** 2–4 concurrent camera streams with frame sampling (1 of every 2 or 3 frames).

### 6.2 Bounded Backpressure & Clock Domains

* **Dual-Clock Domain:** Frames carry both `source_timestamp_ns` (camera hardware clock or capture wall-clock) and `processing_timestamp_ns` (monotonic engine clock). Safety event intervals never compare across mixed clock domains.
* **Frame Staleness Policy:** Frames older than 500ms in the queue are dropped automatically with metric increment `frames_dropped += 1`.
* **Zero Fabrication Rule:** FPS, latency, frame counts, and inference results are strictly calculated from active monotonic timers and buffer counters. When no camera is running, the system honestly reports 0 FPS and `OFFLINE` / `DISCONNECTED`.

---

## 7. Phased Deliverables & Acceptance Gates

### Phase 0: Repository Audit & Roadmap Formulation
* **Gate:** Full test baseline passing (101/101), Git state preserved, architectural interfaces audited.
* **Status:** **PASSED.**

### Phase 1: Real Camera Ingestion & Secure Lifecycle
* **Gate:** Authenticated camera registration, credential masking, SSRF rejection, browser webcam push, and clean lifecycle management (start/stop/reconnect).
* **Status:** **IMPLEMENTED & VERIFIED** (7 dedicated tests passing).

### Phase 2: Real-Time Inference & Safety Rules Integration
* **Gate:** Live frame processing through YOLO adapter, multi-object tracking, temporal zone containment, and capability introspection (disabling PPE on COCO models).
* **Status:** **IMPLEMENTED & VERIFIED.**

### Phase 3: Multi-Camera Operations Console
* **Gate:** React frontend with camera grid (2x2) and focus view, laptop webcam capture (`getUserMedia`), honest HUD telemetry overlays, and simulation isolation.
* **Status:** **IMPLEMENTED & COMPILED** (Production build passing).

### Phase 4: Incident Operations & Evidence Governance
* **Gate:** Multi-dimensional incident filtering (`camera_id`, `zone_id`, `status`, `severity`), human acknowledgement workflow, and SHA-256 verified evidence downloads.
* **Status:** **IMPLEMENTED & VERIFIED.**

### Phase 5: Multi-Camera Isolation & Edge Concurrency
* **Gate:** Independent camera worker failure isolation, `asyncio.Semaphore` inference guarding, and HTTP 429 concurrency limit enforcement.
* **Status:** **IMPLEMENTED & VERIFIED.**

### Phase 6: Edge Deployment & Documentation
* **Gate:** Complete system documentation (`ARCHITECTURE.md`, `README.md`, `REMEDIATION_STATUS.md`, `LIVE_CAMERA_IMPLEMENTATION_REPORT.md`).
* **Status:** In progress.

---

## 8. Explicit Non-Goals & Deferred Work

1. **Autonomous Machine Actuation:** SENTINEL AI is strictly an advisory monitoring platform. It does not trigger physical emergency stop relays, PLC actuators, or factory equipment.
2. **Regulatory Certification Claims:** The platform is a prototype engineering framework and does not claim OSHA, CE, or ISO 13849 safety certification.
3. **Synthetic Evaluation Substitution:** Base COCO models are never represented as validated PPE detection models. Custom PPE datasets and weights remain an explicit prerequisite for operational PPE enforcement.
4. **Heavyweight Gateway Deployment:** MediaMTX WebRTC gateway is documented and supported as an optional external service, but not forced as a mandatory dependency for local edge monitoring.
