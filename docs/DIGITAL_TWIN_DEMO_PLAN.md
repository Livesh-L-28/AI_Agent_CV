# SENTINEL AI — Cinematic Interactive Digital Twin Demo Plan

## 1. Executive Summary & Audit Baseline

### Git Audit
- **Branch:** `main`
- **Head Commit:** `46f260232e063a2d23f9c02b210ad7845d76b626`
- **Audit Findings:** The repository includes a functional React/TypeScript frontend (`frontend/src/pages/DigitalTwin.tsx`) powered by Three.js (r182), FastAPI REST/WebSocket endpoints (`src/sentinel/api/routers/twin.py`), and real-time YOLO tracking inference on Apple MPS.
- **Safety Precondition:** Existing files and untracked artifacts are preserved. Zero destructive git operations will be performed.

---

## 2. Current Architecture & Scene Graph Analysis

```mermaid
graph TD
    subgraph Frontend [React Frontend - DigitalTwin.tsx]
        UI[Digital Twin UI & HUD Controls]
        SM[Demo Animation State Machine]
        ThreeScene[Three.js Scene Graph]
        Raycaster[Spatial Raycaster & Tooltips]
    end

    subgraph ThreeSceneGraph [Three.js Scene Graph Hierarchy]
        Scene[THREE.Scene] --> AmbientLight[Ambient & Directional Lights]
        Scene --> FloorGroup[Ground Plane & Metric Grid]
        Scene --> EquipmentGroup[Factory Machinery Footprints & Labels]
        Scene --> ZonesGroup[Safety & Restricted Extruded Zones]
        Scene --> CameraGroup[Camera Cones, Mounts & Frustums]
        Scene --> WorkersGroup[Tracked Workers & Motion Trails]
        Scene --> DemoGroup[Demo Scan Pulses & High-Vis Beacons]
    end

    subgraph Backend [FastAPI Backend]
        TwinAPI[/api/v1/twin/scene]
        CameraLiveAPI[/api/v1/cameras/{id}/live]
        StreamWS[/api/v1/stream]
    end

    UI --> SM
    SM --> ThreeSceneGraph
    TwinAPI --> UI
    StreamWS -. Live Telemetry .-> WorkersGroup
```

### Existing Scene Objects & Data Grounding
- **Real-Data Backed:**
  - `cam-facility-01` real live video stream (MJPEG from YOLO inference pipeline).
  - Authentic camera telemetry (`effective_fps`, `average_latency_ms`, `queue_depth`).
  - Spatial zone polygon vertices and rule definitions from `factory_scene_sample.json`.
- **Illustrative / Demo Entities:**
  - Synthetic worker trajectories (`#SIM-884`).
  - Camera cones for offline/unregistered cameras.
  - Scripted incident breach and simulated operator acknowledgment.

---

## 3. Demo State Machine & Scenario Specifications

The scripted demonstration runs approximately **72 seconds** (at 1.0x speed) through 6 distinct stages:

```
[idle] 
  │  (Start Demo clicked)
  ▼
[Scene 1: initializing (0-8s)] ──> Smooth camera orbit fly-in, factory structures & metric grid reveal, camera indicators online
  │
  ▼
[Scene 2: camera_activation (8-18s)] ──> Sequential camera focus, FOV scan pulse, HUD telemetry & live feed preview
  │
  ▼
[Scene 3: worker_tracking (18-32s)] ──> Synthetic worker (#SIM-884) steps from walkway toward bay, real-time spatial breadcrumb trail
  │
  ▼
[Scene 4: zone_event (32-45s)] ──> Worker enters Welding Cell A exclusion zone, perimeter warning pulse, SIMULATED EVENT alert
  │
  ▼
[Scene 5: incident_review (45-60s)] ──> Camera focuses on incident, detailed review drawer slides in, simulated operator verification
  │
  ▼
[Scene 6: overview (60-72s)] ──> Pull-back to isometric view, demo statistics & summary card, replay/exit controls
  │
  ▼
[completed]
```

### Scenario Timeline Matrix

| Scene | Name | Time Range | Target Camera `(X, Y, Z)` | LookAt Target `(X, Y, Z)` | Visual Highlights |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | Factory Initialization | 0.0s – 8.0s | `(30, 48, 55)` → `(20, 24, 38)` | `(30, 0, 20)` | Smooth camera sweep; equipment footprint reveal; grid fade-in; status beacon activation |
| **2** | Camera Network Activation | 8.0s – 18.0s | `(17, 16, 18)` | `(17, 0, 14)` | Camera `cam-facility-01` cyan highlight; frustum scan line sweep; telemetry HUD connection |
| **3** | Worker Tracking | 18.0s – 32.0s | `(22, 14, 25)` | Worker Position | Worker `#SIM-884` moves on floor path `[(15, 20) -> (17, 16)]`; luminous trail; bbox in HUD |
| **4** | Restricted Zone Event | 32.0s – 45.0s | `(19, 12, 22)` | `(17, 0, 13)` | Crossing into `zone-robotics-01`; boundary pulse red; `SIMULATED SAFETY EVENT` HUD banner |
| **5** | Incident Investigation | 45.0s – 60.0s | `(15, 10, 19)` | `(17, 0, 13)` | Incident drawer slide-in; rule `RULE_NO_PEDESTRIANS`; simulated operator review |
| **6** | Factory Overview | 60.0s – 72.0s | `(52, 42, 58)` | `(30, 0, 20)` | Isometric overview; comprehensive demo KPI summary; replay & exit actions |

---

## 4. Strict Live vs. Simulation Separation

1. **Persistent Visual Distinction:**
   - Any simulated entity (worker `#SIM-884`, demo incident alert) renders with a distinctive amber/cyan striped badge containing `SIMULATION — ADVISORY ONLY`.
   - Real camera `cam-facility-01` retains authentic green `LIVE` badge and real FPS/latency telemetry.
2. **Database & External System Isolation:**
   - The demo runs purely in browser state.
   - Zero HTTP POST/PUT mutations sent to `/api/v1/incidents` or `/api/v1/events` during the demo.
   - Zero physical notifications, alerts, or machine interlocks triggered.

---

## 5. Interactive Controls & UI Feature Matrix

1. **Playback Controls:**
   - **Play / Pause / Resume:** Immediate pause without animation jumping or state loss.
   - **Restart:** Resets timeline to `0.0s` and restores default camera view.
   - **Exit Demo:** Cleans up demo Three.js meshes and restores standard interactive digital twin.
   - **Speed Selector:** Toggle between `0.5x`, `1.0x`, and `1.5x` playback speeds.
   - **Scrubbable Progress Timeline:** Interactive slider with scene markers allowing scrubbing to any millisecond.
   - **Skip Buttons:** Step forward (`Next Scene`) or backward (`Previous Scene`).
   - **Fullscreen Presentation Mode:** Expand to full viewport with dedicated cinematic HUD.

2. **Accessibility & Ergonomics:**
   - Keyboard Shortcuts: `Space` (Play/Pause), `Esc` (Exit), `ArrowRight` (Next Scene), `ArrowLeft` (Previous Scene), `F` (Fullscreen).
   - Reduced Motion: Honors `prefers-reduced-motion` by disabling high-frequency camera oscillations and easing transitions instantly.

---

## 6. Verification & Acceptance Testing Plan

1. **State Machine Integrity:**
   - Verification of all state transitions: `idle -> initializing -> camera_activation -> worker_tracking -> zone_event -> incident_review -> overview -> completed`.
   - Verification that scrubbing forwards/backwards maintains correct worker and zone states.
2. **Memory & Resource Leak Prevention:**
   - Proper disposal of Three.js geometries, materials, and textures upon Exit Demo and component unmount.
   - Removal of window resize, keyboard, and animation frame listeners.
3. **Build & Quality Gates:**
   - Frontend TypeScript typecheck (`tsc`) with 0 errors.
   - Production Vite bundle compilation (`npm run build`) with 0 errors.
   - Backend regression test suite (`pytest`) with 100% passing tests.
