# SENTINEL AI — Enterprise Digital Twin Transformation Audit

**System Version:** SENTINEL AI 2.4.0-PROD  
**Audit Date:** October 21, 2026  
**Auditor:** Principal Enterprise UX Architect & Lead Systems Engineer  
**Scope:** Full Platform Audit across Computer Vision, 3D Digital Twin Engine, Multi-Facility Catalog, Agent Orchestration, Evidence Integrity, and Security.

---

## 1. Executive Summary

SENTINEL AI is transitioning from an early-stage prototype dashboard into an enterprise-grade industrial safety intelligence platform. This audit establishes the baseline findings, architectural strengths, diagnosed failure points, and staged implementation priorities across all six core workstreams:

1. **Workstream A:** Enterprise 3D Engine & Viewport Controls
2. **Workstream B:** Multi-Facility Twin Center Architecture
3. **Workstream C:** Computer Vision & Spatial Coordinate Integration
4. **Workstream D:** Explainable Agent Workflows & Deterministic Policy Gating
5. **Workstream E:** Enterprise User Experience & Accessible Design System
6. **Workstream F:** Reliability, Cryptographic Verification, and Operational Security

---

## 2. Baseline Architecture Audit

### 2.1 Technology Stack & Runtime Topology
- **Backend:** Python 3.12 / FastAPI async microservice, SQLAlchemy with async SQLite (`aiosqlite`), PyTorch / Apple Metal Performance Shaders (MPS) for local inference, OpenCV for planar homographies.
- **Frontend:** React 18 with TypeScript 5, Vite build system, Three.js (r182) WebGL2 rendering engine, Lucide React icons, vanilla CSS design tokens (no TailwindCSS dependencies).
- **Communication:** Authenticated REST endpoints (JWT Bearer tokens), real-time bidirectional WebSockets (`/api/v1/twin/ws` and `/api/v1/stream/events`), MJPEG video streaming (`/api/v1/cameras/{id}/stream`).
- **Hardware Profile:** Optimized for local development on Apple Silicon (M-series unified memory) without mandatory external cloud dependencies.

### 2.2 Git Status & Artifact Preservation
All existing modifications and untracked files across `src/sentinel/`, `frontend/`, `docs/`, and `tests/` were audited and preserved. No destructive Git commands (`git clean`, `git reset`, `git stash`, or unprompted commits) were executed.

---

## 3. Workstream Audit Findings

### Workstream A — Enterprise 3D Engine

#### Findings & Diagnosed Issues:
1. **Black Viewport on Walkthrough Activation:**  
   *Root Cause:* In `frontend/src/pages/DigitalTwin.tsx`, the primary Three.js initialization effect (`Effect 3A`) included `isWalkthrough` in its dependency array. Activating walkthrough tore down the WebGL renderer and re-created an empty scene. Because secondary group population effects did not re-trigger, the canvas remained completely empty, showing only the background color.
2. **Coordinate Matrix Overwrites:**  
   In `handlePointerMove`, the pointer dragging handler called `updateCameraPosition()` unconditionally, which recalculated orbital spherical coordinates and overwrote the 1.75 m eye-level camera. Clicking anywhere in the scene also invoked `setIsWalkthrough(false)`, immediately dropping the user out of first-person mode.
3. **Near Clipping Plane Artifacts:**  
   Camera near clipping plane was set to $0.5\text{ m}$. In tight indoor factory aisles, walking close to machines or walls caused geometries to clip prematurely.
4. **Collision & Boundaries:**  
   Prior to remediation, no physical collision checks existed; the camera was bounded only by simple bounding box clamping along the perimeter walls, allowing users to pass through heavy industrial equipment.

#### Resolution Requirements:
- Decouple Three.js scene initialization strictly to `[viewMode]`.
- Synchronize walkthrough state, camera POV, and reduced motion via React refs inside the render loop.
- Populate objects, safety zones, and camera cones immediately upon group instantiation.
- Implement AABB equipment collision detection with avatar clearance ($0.55\text{ m}$) and dual-axis sliding.
- Integrate Pointer Lock API mouse look with click-to-drag fallback.
- Set near plane to $0.1\text{ m}$.
- Expose a development diagnostics panel reporting WebGL context, canvas dimensions, scene object counts, and eye coordinates.

---

### Workstream B — Multi-Facility Twin Center

#### Findings & Diagnosed Issues:
1. **Single-Facility Monolith:**  
   The platform initially provided only a single factory layout ("Manufacturing Plant Alpha"). Real industrial enterprises require centralized oversight across diverse facilities (warehouses, chemical plants, and construction sites).
2. **Shared Engine vs Engine Duplication:**  
   Rather than introducing a second rendering engine or creating four fragmented viewer implementations, the application required a shared Three.js pipeline parameterized by typed, versioned facility models.
3. **Telemetry & Benchmark Honesty:**  
   Synthetic layouts must be explicitly declared. Labeling unverified procedural facilities as live, GPS-accurate digital twins violates enterprise credibility.

#### Resolution Requirements:
- Build four distinct facility configurations with distinct metric dimensions, structural shells, architectural features, equipment arrays, and safety zones:
  1. **Manufacturing Plant** ($60\text{ m} \times 40\text{ m} \times 8.5\text{ m}$): Robotic welding cells, CNC mills, high-bay arrays, electrical panels, pedestrian walkways.
  2. **Warehouse & Logistics** ($70\text{ m} \times 45\text{ m} \times 11.0\text{ m}$): Multi-tier pallet racking, automated loading dock bays, freight trailers, staging areas.
  3. **Process & Chemical Plant** ($65\text{ m} \times 40\text{ m} \times 14.0\text{ m}$): Bulk vertical chemical tanks, distillation columns, pipe rack gantries, centrifugal pumps, secondary containment bunds.
  4. **Construction Site** ($55\text{ m} \times 45\text{ m} \times 16.0\text{ m}$): 15m tower crane, tube-and-clamp scaffolding, hydraulic excavators, structural steel framing.
- Implement `DigitalTwinCenter.tsx` providing a multi-facility catalogue, category filtering, metric specification inspection drawer, and direct launch into 3D inspection.
- Back configurations with backend REST API endpoints: `GET /api/v1/twin/environments` and `GET /api/v1/twin/scene?environment_id={id}`.
- Honestly label baseline facilities as `DEMO_BENCHMARK` and `ILLUSTRATIVE BENCHMARK LAYOUT`.

---

### Workstream C — Vision and Spatial Integration

#### Findings & Diagnosed Issues:
1. **2D-to-3D Coordinate Projection:**  
   Projecting 2D monocular camera detections into metric 3D floor coordinates without calibrated homographies introduces severe spatial error. Monocular parallax and perspective shear cause objects near image edges to misalign with real-world safety zones.
2. **Ground Contact Calculation:**  
   Using bounding-box centers for zone intersection tests places worker coordinates at torso or waist level. Ground contact must be calculated at the bottom-center of the bounding box (`(x1 + x2) / 2, y2`) paired with planar homography projection onto the ground plane ($Z = 0$).
3. **Camera Registration Honesty (`cam-chem-tank-farm`):**  
   The camera entry `cam-chem-tank-farm` in the Chemical facility represents a configured 3D mounting reference without an active physical RTSP video stream. Fabricating 30 FPS video telemetry or displaying live video reticles for an unregistered camera violates telemetry honesty.

#### Resolution Requirements:
- Implement `PlanarHomography` in `src/sentinel/vision/geometry.py` with 4-point correspondence validation, collinearity guards, non-singular determinant checks, and projective singularity handling.
- Calculate bottom-center ground contact in `src/sentinel/vision/ground_contact.py`.
- Render camera coverage polygons only when `cam.calibrated && cam.coverage_polygon_meters.length >= 3`.
- Explicitly mark `cam-chem-tank-farm` as `UNREGISTERED SENSOR NODE • NO PHYSICAL RTSP STREAM ATTACHED • SPATIAL VANTAGE PREVIEW ONLY (UNCALIBRATED)`.
- Connect 3D viewer to live WebSocket `/api/v1/twin/ws` with real worker track ingestion and 2500 ms staleness pruning.
- Strictly segregate simulated demo scenarios (`DEMO_SIMULATION_ACTIVE` banner) from live sensor ingestion.

---

### Workstream D — Agent Operations & Explainability

#### Findings & Diagnosed Issues:
1. **Advisory LLM vs Authoritative Policy:**  
   Using LLMs for authoritative safety gating introduces hallucination and waiver risks (e.g., an LLM excusing a missing hardhat because the worker "is only staying for a minute").
2. **Auditability & Provenance:**  
   Enterprise safety officers require a clear, immutable audit trail showing the triggering observation, the specific rule evaluated, allowlisted tools dispatched, and cryptographic evidence verification.

#### Resolution Requirements:
- Enforce the 4-stage bounded workflow in `src/sentinel/agents/workflow.py`:
  - **Stage 1 (Investigator):** Advisory LLM synthesis of observations, risk assessment, and missing evidence identification.
  - **Stage 2 (Policy Gate):** Deterministic safety gate in `src/sentinel/agents/policy_gate.py` that evaluates hardcoded rules (e.g., minimum 5-frame persistence) and cannot be overturned by an LLM.
  - **Stage 3 (Responder):** Execution of strictly allowlisted tools (`create_incident`, `dispatch_alert`) with idempotency guarantees.
  - **Stage 4 (Verifier):** Cryptographic verification of database persistence and alert sink delivery.
- Provide interactive visualization in `frontend/src/pages/AgentTrace.tsx` showing all four stages, risk assessment, cited evidence IDs, deterministic rule evaluation, and audit evidence.
- Implement RBAC-governed incident review in `frontend/src/pages/Incidents.tsx` with SHA-256 evidence integrity validation.

---

### Workstream E — Enterprise User Experience & Accessible Design System

#### Findings & Diagnosed Issues:
1. **Aesthetic Consistency & Visual Polish:**  
   The application required a refined, enterprise design system prioritizing operational clarity over decorative sci-fi themes. Contrast ratios, typography, spacing, and semantic status indicators needed standardization across all pages.
2. **Accessibility & Reduced Motion:**  
   Users with vestibular disorders or reduced-motion preferences require subdued camera transitions, disabled pulsing effects, and damped walking speeds.

#### Resolution Requirements:
- Standardize CSS design tokens in `frontend/src/index.css` for semantic statuses (`--status-success`, `--status-warning`, `--status-danger`, `--status-info`), neutral backgrounds (`--bg-main`, `--bg-card`, `--bg-surface`), and borders.
- Support seamless Dark and Light theme switching with Three.js background and fog synchronization.
- Implement accessible components: `FilterBar`, `StatusBadge`, `Drawer`, `SkeletonLoader`, `EmptyState`, and `TelemetryBanner`.
- Differentiate operational pages clearly:
  - **Operations Overview:** High-level KPIs, safety score, active alerts, facility status.
  - **Live Monitor:** Multi-camera grid, SSRF-guarded stream ingestion, model performance telemetry.
  - **Digital Twin Center:** Multi-facility catalog and specification inspector.
  - **3D Digital Twin Viewer:** Dual-mode orbital inspection and first-person walkthrough.
  - **Incidents:** Triage queue, RBAC review actions, SHA-256 evidence downloader.
  - **Agent Trace:** 4-stage auditable investigation DAG.
  - **Model Evaluation:** Confusion matrix, PR curves, mAP metrics, false positive analysis.
  - **Zone Policies:** Spatial polygon boundaries, min persistence counts, severity configuration.

---

### Workstream F — Reliability, Security & Verification

#### Findings & Diagnosed Issues:
1. **Authentication & Authorization (RBAC):**  
   Endpoints and review actions must enforce authenticated roles (`admin`, `safety_officer`, `viewer`).
2. **SSRF Guardrails:**  
   Camera registration must prevent attackers from specifying internal loopback or cloud metadata IP addresses (`127.0.0.1`, `169.254.169.254`).
3. **Evidence Integrity:**  
   Evidence frames on disk must be verified via SHA-256 hashes to detect tampering or corruption.

#### Resolution Requirements:
- JWT Bearer token authentication with role hierarchy.
- SSRF URL and IP validation in `src/sentinel/api/routers/cameras.py`.
- SHA-256 verification in `EvidenceRepository` returning HTTP 409 on tampering.
- Regression test suites covering frontend lifecycle (`npm test`), Python backend (`pytest tests/`), and TypeScript production build (`npm run build`).

---

## 4. Staged Implementation Plan

| Stage | Focus Area | Dependencies | Acceptance Criteria |
| :--- | :--- | :--- | :--- |
| **Stage 1** | 3D Engine Stability & Walkthrough Controls | Three.js WebGL2, React hooks | Viewport is never black; near plane at $0.1\text{ m}$; WASD + mouse-look operational; ref-based animation loop. |
| **Stage 2** | Procedural Industrial Assets & Realistic PBR | `factoryGeometry.ts`, `environmentGeometry.ts` | Detailed building shell, textured concrete floor, high-bay lights, realistic equipment models, raycasting metadata hover. |
| **Stage 3** | Multi-Facility Twin Center Architecture | Stage 1 & 2, `DigitalTwinCenter.tsx`, `twin.py` | 4 facilities selectable; shared renderer; spec inspector drawer; honest `DEMO_BENCHMARK` labeling. |
| **Stage 4** | Vision Integration & Spatial Honesty | Planar homography, ground contact, WebSocket | Bottom-center contact mapping; uncalibrated cameras disabled; `cam-chem-tank-farm` labeled unregistered; real track streaming. |
| **Stage 5** | Agent Investigation & Evidence Provenance | `AgentTrace.tsx`, `Incidents.tsx`, `workflow.py` | 4-stage DAG visualizer; deterministic policy gate; SHA-256 evidence download; RBAC review actions. |
| **Stage 6** | Accessibility, Performance, Security & Verification | Stage 1–5, test runners | Zero TypeScript errors; 10/10 frontend tests pass; 115/115 backend tests pass; Reduced Motion verified. |

---

## 5. Audit Conclusion

The SENTINEL AI platform architecture is fundamentally sound and well-structured. The primary failure point—the black viewport in walkthrough mode—was caused by a lifecycle synchronization defect in React effect dependencies rather than a Three.js or WebGL deficiency. With the fixes implemented in `DigitalTwin.tsx`, the platform achieves reliable first-person walkthrough navigation, multi-facility configuration, honest vision data integration, auditable agent workflows, and verified evidence integrity.
