# SENTINEL AI — Operational Digital Twin Implementation Report

**Document Version:** 1.0.0  
**Date:** October 21, 2026  
**Auditor & Principal Engineer:** Principal Software Architect, Computer Vision Engineer, Real-Time Streaming Engineer, and SRE  
**Repository Baseline:** `~/AI_Agent_CV` (`main` @ `46f2602`)  
**Verified Test Baseline:** **105 tests passed, 0 failures** (`pytest -v`)  
**Static Code Analysis:** **All checks passed** (`ruff check src/ tests/`)  
**Frontend Production Build:** **Compiled in 1.56s with 0 errors** (`npm run build`)  
**Git Check:** **Clean diff formatting with 0 errors** (`git diff --check`)  

---

## 1. Initial Architecture and Discovered Gaps

Before this sprint, SENTINEL AI possessed a strong computer-vision inference pipeline, multi-object tracking, deterministic temporal rules, JWT RBAC, and camera ingestion. However, there was no spatial plant visualization layer:

1. **No Spatial Factory Model:** Plant geometry was fragmented into arbitrary bounding boxes and normalized 2D image coordinates $[0.0, 1.0]$, with no representation of real-world floor dimensions, equipment footprints, or camera locations.
2. **Missing 3D/2D Spatial Operations Console:** Operators could monitor isolated camera video streams but had no spatial overview of plant-wide traffic, multi-camera blind spots, or zone risk containment.
3. **Disconnected Homography Transforms:** `PlanarHomography` existed in `geometry.py`, but camera calibration matrices were not versioned or tied to live telemetry streams.
4. **No Historical Incident Timeline Replay:** Operators could inspect static database records of incidents, but could not scrub backwards through time to visually reconstruct worker movements or zone breach sequences.

---

## 2. Implemented Architecture & Data Flow

```
+-----------------------------------------------------------------------------------------------------+
|                                    FACTORY SCENE DATA MODEL                                         |
|                                                                                                     |
|  - Dimensions: 60m x 40m x 10m Assembly Bay                                                        |
|  - Floors: Ground Fabrication Level (0m) & Mezzanine Inspection Platform (4.5m)                     |
|  - Equipment Footprints: Robotic Cells A/B, CNC Milling Centers, Conveyor Line, Forklift Bay, Racks |
|  - Safety Zones: Exclusion Zone (Restricted), Forklift Aisle (Warning), Safe Walkways               |
|  - Spatial Camera Nodes: Position [X, Y, Z], Target, FOV Cones, Calibration Status, Homography      |
+──────────────────────────────────────────────────┬──────────────────────────────────────────────────+
                                                   │
                                                   ▼
+-----------------------------------------------------------------------------------------------------+
|                              LIVE CAMERA & HOMOGRAPHY ENGINE                                        |
|                                                                                                     |
|  CameraPipelineWorker (cv2 / RTSP / Browser Webcam)                                                 |
|     │                                                                                               |
|     ▼                                                                                               |
|  YOLOv8 Inference + MultiObjectTracker                                                              |
|     │                                                                                               |
|     ▼                                                                                               |
|  PlanarHomography.transform_point(ground_contact_u, v) ──> Metric Floor Point [X_m, Z_m]            |
|     │                                                                                               |
|     ▼                                                                                               |
|  WebSocket Broadcast (/api/v1/stream)                                                               |
|     ├── CAMERA_TELEMETRY with world_point: [wx, wz]                                                 |
|     └── SAFETY_EVENT with event_id, zone_id, camera_id, severity                                    |
+──────────────────────────────────────────────────┬──────────────────────────────────────────────────+
                                                   │
                                                   ▼
+-----------------------------------------------------------------------------------------------------+
|                              OPERATIONAL DIGITAL TWIN DASHBOARD                                     |
|                                                                                                     |
|  React 18 + TypeScript + Three.js WebGL Engine (with 2D Floor Plan Fallback)                        |
|                                                                                                     |
|  1. Interactive 3D Spatial Navigation (Orbit, Pan, Zoom, Floor Selection)                           |
|  2. 2D Architectural CAD Floor Plan Fallback (Instant vector layout for low-power edge clients)     |
|  3. Layer Visibility Controls (Safety Zones, Camera FOV Cones, Equipment, Live Tracks, Motion)      |
|  4. Live Worker 3D Pins & Motion Trails (calibrated metric coordinates; zero synthetic positions)   |
|  5. Active Safety Event Visual Highlighting (pulsing red zone barriers on authoritative alerts)     |
|  6. Picture-in-Picture Live Stream Playback (<img src="/cameras/{id}/live?token=..." />)            |
|  7. Historical Replay Timeline Scrubber (Play, Pause, Seek, Speed controls)                         |
+-----------------------------------------------------------------------------------------------------+
```

---

## 3. API Routes and Authorization Behavior

The Digital Twin subsystem is exposed via `src/sentinel/api/routers/twin.py`:

| HTTP Method | Route | Authorization / RBAC | Description & Constraints |
|:---|:---|:---|:---|
| `GET` | `/api/v1/twin/scene` | `VIEWER`, `SAFETY_OFFICER`, `ADMIN` | Retrieves active factory scene model with synchronized live camera statuses. |
| `PUT` | `/api/v1/twin/scene` | `SAFETY_OFFICER`, `ADMIN` | Updates factory scene layout. Enforces RBAC; persists scene to edge storage. |
| `GET` | `/api/v1/twin/calibration/{camera_id}` | `VIEWER`, `SAFETY_OFFICER`, `ADMIN` | Retrieves camera calibration status, homography matrix, and test projections. |
| `POST` | `/api/v1/twin/calibration/{camera_id}` | `SAFETY_OFFICER`, `ADMIN` | Submits 4+ point correspondences. Validates collinearity and singular matrices before saving. |
| `GET` | `/api/v1/twin/replay` | `VIEWER`, `SAFETY_OFFICER`, `ADMIN` | Retrieves historical incident and safety event snapshots for timeline scrubbing. |

---

## 4. Files Created and Modified

| File | Change Description & Rationale |
|:---|:---|
| `src/sentinel/api/schemas.py` | Added `FloorLevel`, `EquipmentAsset`, `WalkwayPath`, `SpatialSafetyZone`, `SpatialCameraNode`, `FactorySceneModel`, `CameraCalibrationRequest`, `CameraCalibrationResponse`, and `ReplayTimelineSnapshot` models. |
| `src/sentinel/api/routers/twin.py` | **NEW.** API router implementing factory scene management, camera calibration calculations, homography validation, and incident replay retrieval. |
| `src/sentinel/api/routers/__init__.py` | Exported `twin` router in the router package. |
| `src/sentinel/api/app.py` | Registered `twin.router` under `/api/v1/twin`. |
| `data/fixtures/factory_scene_sample.json` | **NEW.** Comprehensive 60m x 40m reference factory scene fixture including 2 floor levels, 8 equipment assets, 2 walkways, 4 safety zones, and 3 camera nodes. |
| `src/sentinel/vision/camera_manager.py` | Integrated `PlanarHomography` into `CameraPipelineWorker` to compute calibrated `world_point` metrics on active tracks and broadcast `SAFETY_EVENT` messages over WebSocket. |
| `frontend/src/services/api.ts` | Added Digital Twin TypeScript interfaces and API functions (`fetchFactoryScene`, `updateFactoryScene`, `fetchCameraCalibration`, `submitCameraCalibration`, `fetchReplayTimeline`). |
| `frontend/src/pages/DigitalTwin.tsx` | **NEW.** Interactive 3D WebGL and 2D CAD floor plan visualization component with Three.js orbit controls, camera coverage frustums, live worker tracking pins, pulsing alert beacons, embedded PiP live video, and historical replay scrubber. |
| `frontend/src/App.tsx` | Added Digital Twin navigation tab and route in the primary sidebar. |
| `tests/test_digital_twin.py` | **NEW.** Automated test suite covering scene model validation, RBAC boundaries, homography calibration workflows, collinearity rejection, forward/inverse math, and replay timelines. |
| `docs/DIGITAL_TWIN_ARCHITECTURE.md` | **NEW.** Architectural blueprint documenting coordinate reference frames, scene schemas, event flows, and edge resource controls. |

---

## 5. Automated Verification and Test Results

### 5.1 Digital Twin Test Suite (`tests/test_digital_twin.py`)
Executed via `.venv/bin/pytest tests/test_digital_twin.py -v`:
```
============================= test session starts ==============================
platform darwin -- Python 3.12.13, pytest-9.1.1, pluggy-1.7.0
rootdir: /Users/livesh/AI_Agent_CV
configfile: pyproject.toml
plugins: cov-7.1.0, asyncio-1.4.0, anyio-4.15.1
collected 4 items

tests/test_digital_twin.py::test_factory_scene_model_retrieval_and_rbac PASSED   [ 25%]
tests/test_digital_twin.py::test_camera_calibration_workflow_and_validation PASSED [ 50%]
tests/test_digital_twin.py::test_homography_coordinate_transform_mathematics PASSED [ 75%]
tests/test_digital_twin.py::test_historical_replay_timeline_endpoint PASSED    [100%]

============================== 4 passed in 1.26s ===============================
```

### 5.2 Full Repository Test Suite
Executed via `.venv/bin/pytest -v`:
```
============================= test session starts ==============================
collected 105 items

tests/test_agent_workflow.py ....                                        [  3%]
tests/test_api.py .....                                                  [  8%]
tests/test_auth_regression.py ........                                   [ 16%]
tests/test_config.py .......                                             [ 22%]
tests/test_db_repositories.py .....                                      [ 27%]
tests/test_digital_twin.py ....                                          [ 31%]
tests/test_e2e.py ..                                                     [ 33%]
tests/test_evidence_integrity.py .....                                   [ 38%]
tests/test_geometry.py ........                                          [ 45%]
tests/test_live_camera.py .......                                        [ 52%]
tests/test_logging.py ....                                               [ 56%]
tests/test_ppe.py .......                                                [ 62%]
tests/test_sources.py .......                                            [ 69%]
tests/test_telemetry_honesty.py .....                                    [ 74%]
tests/test_temporal_engine.py ......                                     [ 80%]
tests/test_tools.py .....                                                [ 84%]
tests/test_tracking.py .....                                             [ 89%]
tests/test_video_inference.py .                                          [ 90%]
tests/test_vision_adapter.py .....                                       [ 95%]
tests/test_zones.py .....                                                [100%]

======================= 105 passed, 1 warning in 21.96s ========================
```

### 5.3 Static Linting and Production Build
- `ruff check src/ tests/`: **All checks passed (0 errors)**.
- `cd frontend && npm run build`: **Compiled in 1.56s (0 TypeScript errors)**.
- `git diff --check`: **Clean formatting (0 errors)**.

---

## 6. Demonstrated Capabilities (Acceptance Gates)

1. **Configurable Scene Loading:** The factory scene loads from `data/fixtures/factory_scene_sample.json`, rendering a realistic 60m x 40m facility with distinct equipment models, zones, walkways, and camera nodes.
2. **2D & 3D Dual-Mode Visualizer:** Seamless switching between high-fidelity 3D WebGL perspective view and lightweight 2D CAD architectural floor plan.
3. **Genuine Live Camera Playback:** Clicking on any camera node opens an in-scene picture-in-picture drawer playing the authentic, authenticated MJPEG video stream (`/api/v1/cameras/{id}/live?token=...`).
4. **Calibrated Tracking Projection:** Active worker positions are transformed into metric floor coordinates via `PlanarHomography` when calibration exists. Uncalibrated cameras display an explicit `Uncalibrated (Pixel HUD Only)` badge with zero fabricated coordinates.
5. **Authoritative Event Highlighting:** Real-time safety events broadcast over WebSocket flash the exact violated zone in 3D/2D with pulsing beacon boundaries.
6. **Historical Replay Timeline:** Replay scrubber enables playback and examination of persisted incidents and tracking paths.
7. **Resource Cleanup & Accessibility:** Three.js geometries, materials, and WebGL contexts are disposed on unmount; reduced-motion settings suppress pulsating animations and camera transitions.

---

## 7. Known Limitations and Calibration Guidelines

1. **Monocular Planar Ground Assumptions:** Detections mapped to the floor plane assume the worker is standing on flat ground ($Y=0$). Foot occlusions or non-upright postures (crouching, climbing equipment) displace the projected ground contact point.
2. **Replay Track Resolution:** Historical replay renders events and snapshots stored in the relational database. Continuous sub-second trajectory reconstruction requires an active telemetry recorder service.
3. **Hardware Acceleration:** High-complexity 3D scenes require WebGL support. For low-power, headless, or remote client displays, the integrated 2D Floor Plan fallback provides identical operational visibility with negligible CPU usage.
