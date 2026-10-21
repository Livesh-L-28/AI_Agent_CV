# SENTINEL AI — Master Enterprise Implementation Plan

**Document Version:** 2.0.0  
**Status:** Executed & Verified Baseline  
**Date:** October 21, 2026  
**Scope:** Full-System Enterprise Transformation across UI/UX, 3D Digital Twin, Multi-Facility Architecture, Computer Vision, Multi-Agent Workflows, Incidents & Evidence Integrity, Enterprise Security, and Observability.  
**Repository:** `~/AI_Agent_CV` (`main`)  
**Target Platform:** Apple Silicon / Linux Edge Gateway / Cloud Kubernetes  

---

## 1. Executive Vision and System Architecture

SENTINEL AI is an enterprise-grade cyber-physical safety intelligence platform designed for high-risk industrial environments (discrete manufacturing, chemical refining, logistics warehousing, and heavy construction). The platform bridges computer vision inference at the industrial edge with spatial digital twins and auditable multi-agent incident orchestration.

### 1.1 Non-Negotiable Core Principles

1. **Deterministic Safety Policy Supremacy:** Probabilistic Large Language Models (LLMs) operate strictly in an advisory, contextual, and descriptive capacity. No LLM output may overturn deterministic safety rules, suppress verified hazard detections, or issue unauthorized actuation commands to plant machinery.
2. **Telemetry Honesty & Provenance:** The system strictly separates live physical camera feeds, recorded review footage, synthetic simulation fixtures, and offline nodes. Sensor streams must never display fabricated frame rates, synthetic detections, or synthetic resolutions under the guise of live telemetry.
3. **Cryptographic Evidence Integrity:** All media artifacts (camera snapshots, video clips, bounding-box crops) stored in the evidence repository are verified via SHA-256 cryptographic hashes upon ingestion and retrieval. Tampered or missing assets are rejected with explicit HTTP 409 Conflict or HTTP 404 Not Found status codes.
4. **Spatial Ground Truth & Metric Homography:** 2D bounding boxes in normalized camera coordinate space $[u, v] \in [0.0, 1.0]$ are projected to metric plant coordinates $[X_m, Z_m]$ solely via validated planar homography matrices using bottom-center ground contact points. Uncalibrated cameras are explicitly flagged and prevented from projecting synthetic 3D spatial tracks.
5. **Bounded, Auditable Agent Workflows:** Autonomous agents execute within a strictly typed 4-stage directed acyclic graph (DAG) with allowlisted tool definitions, idempotency keys, execution timeouts, and immutable audit logs.

---

## 2. Phased Transformation Roadmap

```
+──────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                  SENTINEL AI ENTERPRISE ROADMAP                                          |
+──────────────────────────────────────────────────────────────────────────────────────────────────────────+
|                                                                                                          |
|   PHASE A: ENTERPRISE UI/UX REDESIGN                                                                     |
|   ├── Centralized Design Tokens & CSS Variables (Light / Dark / High-Contrast System Themes)              |
|   ├── Modular Component Library (Header, Sidebar, KPI Cards, Drawers, Modals, Badges, FilterBars)       |
|   └── Full Refresh of 8 Operational Routes with Responsive Layouts & WCAG 2.2 AA Compliance              |
|                                                                                                          |
|   PHASE B: DIGITAL TWIN ENGINE & MULTI-FACILITY EXPANSION                                                |
|   ├── Three.js Lifecycle Fix (Decoupled WebGL initialization, Near Plane 0.1m, Immediate Mesh Mounting) |
|   ├── First-Person Walkthrough (Eye Height 1.75m, Pointer Lock, AABB Collision Sliding, HUD, Diag)      |
|   └── Multi-Facility Digital Twin Center (4 Versioned Environments: Mfg, Warehouse, Chemical, Constr.)   |
|                                                                                                          |
|   PHASE C: COMPUTER VISION & CAMERA INTEGRATION                                                          |
|   ├── Multi-Source Ingestion Pipeline (OpenCV Webcam, RTSP, Video File, Mock Synthetic)                 |
|   ├── YOLOv8 Tensor Inference & ByteTrack Association Engine                                            |
|   └── Planar Homography Engine (4-point correspondence, Collinearity & Determinant Checks, Overlays)     |
|                                                                                                          |
|   PHASE D: AGENTIC AI & DETERMINISTIC POLICY ENFORCEMENT                                                 |
|   ├── 4-Stage Bounded Orchestration (Investigator -> Policy Gate -> Responder -> Verifier)               |
|   ├── Deterministic Safety Policy Gate (Temporal persistence thresholds, non-overridable rules)          |
|   └── Tool Execution Allowlist (Idempotency keys, RBAC verification, Audit logging)                      |
|                                                                                                          |
|   PHASE E: INCIDENT INVESTIGATION & EVIDENCE INTEGRITY                                                   |
|   ├── Evidence Repository with SHA-256 Digest Verification & Tamper Detection                           |
|   ├── Interactive Incident Triage Workspace (Search, Filtering, Lifecycle State Transitions)             |
|   └── Audit Trail & Historical Incident Timeline Replay                                                  |
|                                                                                                          |
|   PHASE F: ENTERPRISE SECURITY, RELIABILITY & OBSERVABILITY                                              |
|   ├── JWT Authentication, Role-Based Access Control (Viewer, Safety Officer, Admin), SSRF Guardrails     |
|   ├── WebSocket Authentication, Heartbeat Reconnection & Connection State Management                     |
|   └── Structured JSON Logging, Health Probes (`/healthz`, `/readyz`), and Containerization              |
|                                                                                                          |
|   PHASE G: COMPREHENSIVE AUTOMATED VERIFICATION                                                          |
|   ├── Backend Test Suite (Pytest: Unit, Integration, Security, Geometry, Temporal Engine, Regressions)  |
|   ├── Frontend Node Test Suite (Component Lifecycle, Telemetry Honesty, Multi-Twin Catalog)             |
|   └── Production Build & Bundle Size Optimization                                                        |
+──────────────────────────────────────────────────────────────────────────────────────────────────────────+
```

---

## 3. Workstream Specifications

### Workstream A: UI/UX Redesign & Shared Component Architecture

- **Tokens & Theming:**
  - Semantic variables defined in `frontend/src/index.css`: `--bg-app`, `--bg-surface`, `--bg-card`, `--border-base`, `--text-primary`, `--text-secondary`, `--brand-primary`, `--status-normal`, `--status-warning`, `--status-critical`.
  - Seamless toggle between Dark Mode (`theme-dark`) and Light Mode (`theme-light`) with automatic Three.js scene background and fog synchronization.
- **Shared Components:**
  - `frontend/src/components/common/StatusBadge.tsx`: Standardized indicators for connection and hazard severity.
  - `frontend/src/components/common/KpiCard.tsx`: Standardized metrics display with trend deltas, loading skeletons, and honest fallback indicators.
  - `frontend/src/components/common/FilterBar.tsx`: Accessible search and filter controls.
  - `frontend/src/components/common/Drawer.tsx` & `Modal.tsx`: Focus-trapped, keyboard-navigable contextual inspection containers.
  - `frontend/src/components/layout/Sidebar.tsx` & `AppHeader.tsx`: Responsive navigation shell with live backend health indicator, active route highlighting, and role display.
- **Route Redesign Across All 8 Views:**
  1. `Overview.tsx`: Operational KPIs, real-time activity trends, camera fleet status, incident severity breakdown.
  2. `LiveMonitor.tsx`: Grid vs Focus viewing, camera health telemetry, live detection overlays, stream state differentiation.
  3. `DigitalTwinCenter.tsx`: Industrial facility catalog, environment cards, capabilities badges, scene metrics.
  4. `DigitalTwin.tsx`: Interactive 3D spatial viewport, layer toggles, camera POV presets, first-person walkthrough HUD.
  5. `Incidents.tsx`: Searchable incident triage workspace, severity filtering, review actions, evidence verification status.
  6. `AgentTrace.tsx`: Visual 4-stage agent execution DAG, cited evidence inspection, deterministic rule confirmation, tool execution audit.
  7. `ModelEvaluation.tsx`: Model benchmark metrics, precision/recall curves, confusion matrix, dataset versioning.
  8. `ZoneConfig.tsx`: Interactive 2D/3D polygon zone editor, safety rule bindings, persistence configuration.

---

### Workstream B: Digital Twin Engine & Multi-Facility Architecture

- **Viewport Reliability & Lifecycle Fixes:**
  - Decouple Three.js initialization effect dependencies in `DigitalTwin.tsx` to prevent blank canvas re-initializations during camera or walkthrough state changes.
  - Set camera near clipping plane to `0.1` meters to eliminate clipping artifacts in close-quarters indoor walkthroughs.
  - Populate Three.js groups (`objectsGroup`, `zonesGroup`, `cameraConesGroup`) immediately on mount to prevent black viewport race conditions during network latency.
  - Use React `useRef` handles inside the RAF `animate()` loop for `isWalkthroughRef`, `cameraPovIdRef`, and `reducedMotionRef` to eliminate re-render hitching.
- **First-Person Walkthrough Engine:**
  - Eye level locked to standard industrial ergonomics ($1.75\text{ m}$).
  - Movement integration via delta-time ($dt$) for frame-rate-independent navigation.
  - Dual-axis AABB collision detection (`isPositionBlockedByEquipment`) with avatar safety clearance ($0.55\text{ m}$) enabling smooth wall sliding.
  - Pointer Lock API mouse-look with visible click-and-drag fallback.
  - Real-time Walkthrough HUD displaying live coordinates $(X, Z)$, eye height, heading compass, and movement controls.
  - Dev Diagnostics panel (`DIAG: ON/OFF`) exposing Three.js r182 state, WebGL context, canvas dimensions, mesh count, eye position, heading, pointer lock status, and FPS.
- **Multi-Facility Industrial Environments:**
  1. **Manufacturing Plant** ($60\times 40\times 8.5\text{ m}$): Heavy CNC milling, robotic arm cells, pallet staging, overhead gantry cranes, and safety fences.
  2. **Warehouse & Logistics** ($70\times 45\times 11\text{ m}$): High-bay selective pallet racking, automated conveyor sorting loop, battery charging stations, and forklift corridors.
  3. **Process & Chemical Plant** ($65\times 40\times 14\text{ m}$): Fractionation towers, pressurized spherical gas tanks, horizontal storage drums, structural pipe bridges, and containment berms.
  4. **Construction Site** ($55\times 45\times 16\text{ m}$): Multi-story concrete core under construction, tower crane mast, excavation trench with shoring, scaffolding, and perimeter fencing.
  - Typed schema in `environmentGeometry.ts` and backend catalog in `src/sentinel/api/routers/twin.py`.

---

### Workstream C: Computer Vision & Spatial Calibration

- **Multi-Source Ingestion Pipeline:**
  - Abstract base `BaseVideoSource` supporting OpenCV Webcams (`cv2.VideoCapture`), RTSP network streams, pre-recorded video test files, and mock generators.
  - Thread-safe `CameraPipelineWorker` with bounded frame queues, automatic reconnection with exponential backoff, and frame drop monitoring.
  - Explicit telemetry reporting: stream status (`ONLINE`, `STREAMING`, `OFFLINE`, `DISCONNECTED`), effective FPS, latency, and packet loss.
- **Detection & Tracking:**
  - YOLOv8 inference model targeting person and PPE classes (hardhats, high-visibility vests).
  - Multi-object tracking (`ByteTrack` association) maintaining temporal track IDs across occlusions and frame drops.
- **Planar Homography & Coordinate Transformation:**
  - `PlanarHomography` in `src/sentinel/vision/geometry.py`: Validates 4-point image-to-ground correspondences, checks for point collinearity, confirms non-singular matrix determinants, and prevents projective singularities.
  - `calculate_ground_contact` in `src/sentinel/vision/ground_contact.py`: Projects bottom-center bounding-box coordinates $[(u_{min}+u_{max})/2, v_{max}]$ into real-world floor coordinates $[X_m, Z_m]$.
  - Visual camera coverage polygons in 3D scene gated strictly on `camera.calibrated == true`. Uncalibrated nodes (e.g., `cam-chem-tank-farm`) are visually flagged and restricted to spatial vantage previews.

---

### Workstream D: Multi-Agent AI & Deterministic Safety Gating

- **4-Stage Bounded Directed Acyclic Graph:**
  1. **Stage A: Event Investigator:** Synthesizes spatial observations, track history, and supporting detections into structured JSON summaries with cited evidence IDs. Degrades gracefully to rule-based analysis if the LLM provider times out or fails.
  2. **Stage B: Policy Gate (Deterministic Supremacy):** Pure deterministic evaluation in `policy_gate.py`. Validates temporal persistence thresholds (e.g., $\ge 5$ frames for restricted zone entry, $\ge 6$ frames for PPE dropout). Cannot be overturned by LLM rationale.
  3. **Stage C: Response Agent (Allowlisted Tools):** Executes strictly allowlisted, parameterized tools (`create_incident`, `send_supervisor_alert`, `request_human_review`, `get_incident_status`) with verified idempotency keys and RBAC caller authorization.
  4. **Stage D: Verification Agent:** Inspects actual execution return values, verifies database persistence of incident records, and confirms notification dispatch before marking the workflow as `COMPLETED`.
- **Auditability & Traceability:**
  - Full execution traces persisted to `AgentRunModel` and `ToolExecutionModel`.
  - Immutable audit trail logged to `AuditRepository`.
  - Visual DAG rendering in `frontend/src/pages/AgentTrace.tsx`.

---

### Workstream E: Incidents & Evidence Integrity

- **Evidence Repository & Integrity Checks:**
  - SHA-256 hash calculated upon binary upload in `src/sentinel/db/repositories/evidence_repo.py`.
  - Hash recalculated upon file retrieval; mismatched hashes return HTTP 409 Conflict, preventing tampered evidence from polluting investigations.
  - Missing evidence files return HTTP 404 Not Found with explicit audit warnings.
- **Incident Workspace & Lifecycle:**
  - Searchable, filterable incident workspace in `frontend/src/pages/Incidents.tsx`.
  - Lifecycle state management: `OPEN`, `IN_REVIEW`, `RESOLVED`, `DISMISSED`.
  - Contextual detail drawer with worker track ID, source camera, zone rule breached, temporal persistence count, and evidence download action.

---

### Workstream F: Enterprise Security, Reliability & Observability

- **Authentication & RBAC:**
  - JWT token verification with configurable expiration and secret signing.
  - Role hierarchy: `VIEWER` (read-only), `SAFETY_OFFICER` (incident triage, review, manual alerts), `ADMIN` (camera registration, policy configuration, system settings).
  - WebSocket authentication via token query parameter or first-message handshake with automated connection heartbeat and bounded retries.
  - SSRF protection on network camera registration: Private RFC 1918 IPs and localhost loops are validated and controlled via `ALLOW_LOCAL_STREAMS` configuration.
- **Reliability & Observability:**
  - Structured JSON logging via `src/sentinel/logging.py` with correlation IDs.
  - Kubernetes-ready health endpoints: `GET /healthz` (liveness probe) and `GET /readyz` (readiness probe verifying database and camera worker pools).
  - Production containerization via multi-stage `Dockerfile` and `docker-compose.yml`.

---

## 4. Dependencies and Critical Path

| Phase | Milestone | Dependencies | Critical Risks & Mitigation |
|:---|:---|:---|:---|
| **Phase 0** | Baseline Audit & Preservation | None | Risk of modifying uncommitted user work; enforced strict read-only audit before modification. |
| **Phase A** | Enterprise UI/UX System | None | CSS specificity regressions; mitigated by CSS variable tokens and scoped utility classes. |
| **Phase B** | Digital Twin Viewport & Realism | Phase A | WebGL context loss or black screen; mitigated by decoupling Three.js lifecycle from network effects. |
| **Phase C** | Vision & Homography Ingestion | Phase B | Degenerate homography matrices; mitigated by 4-point collinearity and determinant checks. |
| **Phase D** | Agentic AI Orchestration | Phase C | LLM hallucinations or unauthorized actuation; mitigated by deterministic policy gate supremacy. |
| **Phase E** | Incidents & Evidence Integrity | Phase D | Tampered evidence artifacts; mitigated by SHA-256 cryptographic verification on retrieval. |
| **Phase F** | Security, RBAC & Observability | Phase E | Unauthenticated WebSocket access; mitigated by JWT handshake authentication. |
| **Phase G** | End-to-End Quality Gates | All | Regressions in edge cases; mitigated by comprehensive Pytest and Node test suites. |

---

## 5. Verification Gates and Acceptance Criteria

Every milestone must satisfy the following automated quality gates before acceptance:

1. **Frontend Unit & Component Tests:** `npm test --prefix frontend` must execute 10/10 tests with 0 failures.
2. **Frontend Production Build:** `npm run build --prefix frontend` must compile via Vite with TypeScript strict checking and 0 errors.
3. **Backend Test Suite:** `.venv/bin/pytest tests/` must execute all 115 tests with 100% pass rate.
4. **Code Quality & Formatting:** `git diff --check` must return 0 trailing whitespace or formatting conflicts.
5. **Telemetry Honesty:** All mock fixtures must be labeled as `DEMO_BENCHMARK` or `SIMULATION` with zero fabricated live metrics.
