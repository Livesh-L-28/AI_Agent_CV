# SENTINEL AI — System Architecture

## 1. High-Level System Architecture

SENTINEL AI is an AI-assisted industrial safety monitoring platform engineered with a strict separation between **deterministic safety logic** and **probabilistic agent reasoning**.

```
+---------------------------------------------------------------------------------------------------+
|                                      VIDEO INGESTION LAYER                                        |
|  - VideoReplaySource (Deterministic Reference)  - WebcamSource (AVFoundation)  - FileUploadSource  |
+-------------------------------------------------+-------------------------------------------------+
                                                  | Bounded Frame Queue (Backpressure protected)
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                 COMPUTER VISION & TRACKING ENGINE                                 |
|  - YOLO Model Adapter (PyTorch/ONNX/MPS/CPU)    - Multi-Object Tracker (ByteTrack / Tracker)       |
|  - Person Ground-Contact Point Estimator        - Normalized Coordinate & BBox Geometry           |
+-------------------------------------------------+-------------------------------------------------+
                                                  | Tracked Entities (ID, Class, BBox, GroundPoint)
                                                  v
+---------------------------------------------------------------------------------------------------+
|                              DETERMINISTIC SPATIAL & EVENT ENGINE                                 |
|  - Restricted Zone Evaluator (Polygon IoU/PIP)  - PPE Association & Occlusion Analysis            |
|  - Temporal Persistence Filter (N of M frames)  - Event Candidate Deduplication & Cooldown        |
+-------------------------------------------------+-------------------------------------------------+
                                                  | Confirmed Safety Event Candidate
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                 STATEFUL AGENT REASONING ENGINE                                   |
|   [Agent A: Investigator]  -->  [Agent B: Policy Gate]  -->  [Agent C: Responder]  -->  [Agent D: Verifier]  |
|   - Evidence synthesis         - Deterministic policy       - Allowlisted tools        - Tool outcome check  |
|   - Uncertainty flagging       - Non-overridable severity   - Idempotent incident      - Audit trace log     |
+-------------------------------------------------+-------------------------------------------------+
                                                  | Evidence & Audit Records
                                                  v
+---------------------------------------------------------------------------------------------------+
|                               BACKEND REPOSITORIES & API LAYER (FastAPI)                          |
|  - Async SQLAlchemy Repositories (PostgreSQL / SQLite)  - REST Endpoints (/api/v1/*)              |
|  - WebSocket Streaming (/api/v1/stream)                - Evidence Asset Storage & Hashing         |
+-------------------------------------------------+-------------------------------------------------+
                                                  | WebSocket & REST
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                 FRONTEND DASHBOARD (React + TypeScript)                           |
|  - Live Annotated Monitor & Zone Overlays       - Incident Management & Audit Explorer            |
|  - Agent Execution Trace Graph                  - Model & Agent Evaluation Benchmarks             |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Core Architectural Principles

1. **Deterministic Authority**:
   - Machine learning and LLMs provide probabilistic evidence.
   - Spatial boundaries (restricted zones), temporal windows (persistence thresholds), and policy enforcement are strictly deterministic.
   - An LLM can never override a safety violation or unilaterally dismiss a safety incident.

2. **Decoupled Pipelines**:
   - Ingestion, vision processing, event calculation, agent investigation, and API serving operate with clear modular boundaries and asynchronous queues.
   - High-throughput video processing is isolated from LLM response latency.

3. **Evidence Grounding & Auditability**:
   - Every incident candidate references exact frame timestamps, tracking IDs, bounding boxes, and image hashes.
   - Agents must cite verified evidence IDs; hallucinated detections are caught by strict Pydantic schema validation.

4. **Multi-Environment Resilience**:
   - Zero-dependency developer mode: SQLite + Local CPU + Local Ollama / Mock LLM.
   - Production / Staging mode: PostgreSQL + Docker + GPU/MPS acceleration + Hosted/Local LLM.

---

## 3. Component Breakdown

### 3.1 Video Sources (`src/sentinel/vision/sources/`)
- `BaseVideoSource`: Abstract base class with lifecycle hooks (`start()`, `stop()`, `get_frame()`, `status`).
- `VideoReplaySource`: Frame-accurate replay of MP4 videos with configurable FPS, looping, and deterministic timestamp generation.
- `WebcamSource`: OpenCV `VideoCapture` wrapper with camera permission error handling and thread-safe frame reading.
- `FrameBuffer`: Thread-safe ring buffer preventing memory leaks and managing backpressure when inference runs slower than ingestion.

### 3.2 Vision & Tracking Engine (`src/sentinel/vision/`)
- `YOLOAdapter`: Abstraction wrapping Ultralytics YOLO models with validated class maps, confidence filtering, and device auto-detection (`cpu`, `mps`, `cuda`).
- `PPEAdapter`: Specialized PPE detection interface with explicit class maps (`helmet`, `vest`, `no_helmet`, `no_vest`).
- `CoordinateUtils`: Normalization between pixel space `[x1, y1, x2, y2]` and unit space `[0.0, 1.0]`.
- `GroundContactEstimator`: Calculates bottom-center ground contact points for workers to accurately determine polygon containment.
- `TrackerAdapter`: Stable multi-object tracking (ByteTrack) maintaining persistent track IDs across frames.

### 3.3 Spatial Rules & Event Engine (`src/sentinel/rules/`)
- `ZoneManager`: Configurable polygon zones using Shapely geometry with validation (non-self-intersecting, normalized coordinates).
- `PPEAssociationEngine`: Geometric intersection over person bounding boxes (head region for helmets, torso region for vests) with temporal confidence accumulation.
- `TemporalEventEngine`: State machine tracking candidate events across a sliding window of frames, enforcing persistence thresholds (e.g. 5 consecutive frames in restricted zone) and cooldown deduplication.

### 3.4 Multi-Agent System (`src/sentinel/agents/`)
- State machine architecture:
  - **Agent A (Investigator)**: Analyzes track trajectory, zone coordinates, and PPE detection confidence. Identifies uncertainties.
  - **Agent B (Policy Evaluator)**: Compares findings against safety policy. Computes severity. The policy gate is deterministic.
  - **Agent C (Response Agent)**: Executes allowlisted tools (`create_incident`, `send_alert`) with idempotency keys.
  - **Agent D (Verification Agent)**: Inspects tool execution outcomes, confirms database record persistence, and signs audit verification.
- Provider abstraction: Supports `OllamaProvider` (local `llama3.2:3b`), `OpenAIProvider`, and `DeterministicMockProvider` for testing.

### 3.5 Persistence & Database (`src/sentinel/db/`)
- SQLAlchemy async ORM models:
  - `VideoSource`: Source metadata, stream URLs, status.
  - `Detection`: Detected object bounding boxes, confidence, class label.
  - `TrackObservation`: Entity tracking trajectories over time.
  - `SafetyEvent`: Raw detected spatial/temporal safety events.
  - `Incident`: Confirmed safety incidents with severity and lifecycle status.
  - `EvidenceAsset`: Image frames, cropped crops, SHA-256 hashes, file storage paths.
  - `AgentRun` & `ToolExecution`: Full agent execution logs, schemas, latencies, and tool responses.
  - `AuditLog`: Immutable security audit trail with correlation IDs.

### 3.6 API & Stream Layer (`src/sentinel/api/`)
- FastAPI application with routers for `/sources`, `/events`, `/incidents`, `/agents`, `/analytics`, and `/health`.
- WebSocket stream router `/api/v1/stream` broadcasting real-time frame annotations and telemetry to connected dashboard clients.

### 3.7 Frontend Dashboard (`frontend/`)
- React 18 + TypeScript + Vite.
- Vanilla CSS / CSS Modules with an industrial dark theme (`#0B1120`, `#1E293B`, `#38BDF8`, `#EF4444`).
- Pages: Overview, Live Monitoring, Source Management, Events & Incidents, Agent Trace Viewer, Model Evaluation, Zone Editor.
