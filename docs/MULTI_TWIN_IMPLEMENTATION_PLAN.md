# SENTINEL AI — Multi-Environment Digital Twin Center Implementation Plan

**Date:** 2026-10-21  
**Repository:** `~/AI_Agent_CV`  
**Status:** In Progress (Phase 0 Complete)  
**Author:** Principal Product Designer & Enterprise UX Architect  

---

## 1. Executive Summary & Objective

Extend the SENTINEL AI Digital Twin platform from a single manufacturing facility into a **Multi-Environment Digital Twin Center** featuring four distinct, configurable industrial environments:

1. **Manufacturing Plant** (Automotive & Precision Machining)
2. **Warehouse & Logistics** (High-Bay Fulfillment & AGV/Forklift Operations)
3. **Process & Chemical Plant** (Fluid Refining, Storage Tanks & Piping Catwalks)
4. **Construction Site** (Structural Steel Frame, Tower Crane & Scaffolding)

The architecture preserves all existing Three.js rendering loops, camera controls, RBAC authorization, telemetry honesty principles, and safety incident pipelines.

---

## 2. Baseline Audit & Constraints

### 2.1 Git Status & Safety Commitments
- Baseline commit: `46f2602` on branch `main`.
- All modified and untracked files are strictly preserved. No `git reset`, `clean`, `stash`, or `commit` operations will be performed.

### 2.2 Existing Digital Twin Verification
- Automated digital twin lifecycle tests pass: `node --test frontend/scripts/test-digital-twin-lifecycle.mjs` (6/6 tests passing).
- Backend twin pytest suite passes: `pytest tests/test_digital_twin*.py` (12/12 tests passing).
- Decoupled WebGL rendering from network sync prevents blank screen rendering if backend sync is unreachable.

---

## 3. Architecture & Data Model

### 3.1 DigitalTwinEnvironmentConfig Schema
Each environment is represented by a typed, versioned configuration object:

```typescript
export interface DigitalTwinEnvironmentConfig {
  id: string; // e.g. 'manufacturing-plant', 'warehouse-logistics'
  name: string; // e.g. 'Detroit Plant Alpha'
  category: 'MANUFACTURING' | 'LOGISTICS' | 'CHEMICAL' | 'CONSTRUCTION';
  subtitle: string;
  description: string;
  dimensions: {
    width_meters: number;
    depth_meters: number;
    height_meters: number;
  };
  supportedCapabilities: string[]; // e.g. ['RESTRICTED_ZONE_DETECTION', 'PPE_COMPLIANCE']
  status: 'DEMO_BENCHMARK' | 'CALIBRATED_SITE' | 'OFFLINE_SPEC';
  sceneModel: FactorySceneModel;
  demoScenarios: DemoScene[];
  provenance: {
    schema_version: string;
    author: string;
    created_at: string;
    coordinate_system: string; // 'Right-handed Y-up metric (meters)'
  };
}
```

### 3.2 Backend Endpoint Additions (`src/sentinel/api/routers/twin.py`)
- `GET /api/v1/twin/environments`: Returns metadata summary for all 4 available environments.
- `GET /api/v1/twin/scene?environment_id={id}`: Returns the authoritative scene model for the selected environment.
- Config validation: Validates polygons (&ge; 3 vertices), positive dimensions, and unique IDs.

---

## 4. Environment Specifications & Distinct 3D Geometry

| Environment | Structural Shell & Floor | Primary 3D Equipment | Safety Zones & Rules | Simulation Scenario |
| :--- | :--- | :--- | :--- | :--- |
| **Manufacturing Plant** | Concrete floor with painted safety lanes, steel columns, roof trusses, 60m x 40m x 8.5m | Robotic welding cells, CNC milling centers, conveyor line, 480V electrical panels, metrology workstation | `zone-robotics-01` (Restricted), `zone-safe-walkway` (Safe) | Worker approaches active welding robot cell and breaches exclusion tripwire. |
| **Warehouse & Logistics** | Polished concrete floor, yellow forklift transit lines, loading dock bays with roll-up doors, 70m x 45m x 11m | Multi-tier high-bay pallet racking, forklift charging bays, docked truck trailers, stretch wrapper | `zone-forklift-aisle` (Warning, vest required), `zone-loading-dock` (Restricted) | Pedestrian enters active forklift traffic aisle during autonomous staging without high-vis vest. |
| **Process & Chemical Plant** | Chemical containment concrete pad, elevated galvanized catwalks with stairs and handrails, 65m x 40m x 14m | Large cylindrical storage tanks, distillation fractionation column, overhead pipe rack gantry, centrifugal transfer pumps, emergency safety shower | `zone-tank-bund` (Restricted), `zone-manifold` (Restricted, hot work permit) | Worker breaches secondary containment bund near active fluid transfer manifold without respiratory gear. |
| **Construction Site** | Compacted earth/aggregate pad with concrete footing slabs, security fence perimeter, 55m x 45m x 16m | Tower crane mast and boom, modular tube-and-clamp scaffolding, hydraulic excavator, concrete pump truck, site office trailer | `zone-crane-swing` (Restricted, overhead hazard), `zone-excavation` (Restricted) | Worker enters crane swing radius directly beneath suspended structural steel payload. |

---

## 5. UI/UX Workflow & Component Design

### 5.1 Digital Twin Center (`DigitalTwinCenter.tsx`)
- Display 4 environment cards in an accessible grid.
- Each card shows:
  - Sector category badge & icon.
  - Environment title, site identifier, and physical dimensions.
  - Configured camera count (derived strictly from configuration).
  - Safety capabilities supported (badges).
  - Prominent "Illustrative Demo Layout" badge.
  - "Launch Interactive 3D Twin" action.
- Filter pills to filter by sector (`All`, `Manufacturing`, `Logistics`, `Chemical`, `Construction`).

### 5.2 Seamless Environment Switching in 3D Scene (`DigitalTwin.tsx`)
- Topbar includes an **Environment Selector Dropdown** with environment metadata and a "Digital Twin Center" button to return to the catalog.
- Proper cleanup: When switching environments, old Three.js geometries, materials, lights, and textures are explicitly disposed of to prevent WebGL memory leaks.
- Preserves all interaction modes: Orbit/Pan/Zoom, CCTV Camera POV, First-Person Walkthrough, 2D Floor Plan, Equipment Raycasting, and Cinematic Guided Demo.

---

## 6. Implementation Sequence & Gates

1. **Phase 1 — Typed Environment Architecture & Configuration Registry:**
   - Define `DigitalTwinEnvironmentConfig` schema.
   - Implement configuration validator (`validateSceneConfiguration`).
   - Create 4 separate, comprehensive environment configurations in `frontend/src/pages/digitaltwin/environments/`.
2. **Phase 2 — Modular 3D Geometry Constructors:**
   - Build specialized procedural 3D constructors in `frontend/src/pages/digitaltwin/environmentGeometry.ts` (storage tanks, distillation column, pipe racks, pallet racks, dock levelers, tower crane, scaffolding, excavator).
3. **Phase 3 — Digital Twin Center View:**
   - Implement `DigitalTwinCenter.tsx` with responsive cards, capability tags, and open action.
   - Update navigation and routing in `App.tsx` and `Sidebar.tsx`.
4. **Phase 4 — Scene Integration & Resource Management:**
   - Wire environment selection into `DigitalTwin.tsx` with complete Three.js resource disposal.
   - Connect backend `/api/v1/twin/environments` and `/api/v1/twin/scene?environment_id=...` endpoints.
5. **Phase 5 — Environment-Specific Demo Scenarios:**
   - Implement 4 distinct simulation scripts with environment-specific worker waypoints, camera angles, and incident descriptions.
6. **Phase 6 — Testing & Verification:**
   - Unit and lifecycle test suites for all 4 environments.
   - `pytest tests/`, `npx tsc --noEmit`, `npm run build`, `git diff --check`.
   - Author `docs/MULTI_TWIN_IMPLEMENTATION_REPORT.md`.
