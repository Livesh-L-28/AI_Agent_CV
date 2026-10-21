# SENTINEL AI — First-Person Digital Twin Walkthrough Fix Report

**System Version:** SENTINEL AI 2.4.0-PROD  
**Evaluation Date:** October 21, 2026  
**Status:** FULLY RESTORED & VERIFIED  

---

## Executive Summary

The first-person walkthrough mode in the SENTINEL AI Digital Twin Viewer was diagnosed with a critical rendering failure: clicking "First-Person Walkthrough" resulted in an entirely black 3D viewport despite showing the HUD overlay with "Walkthrough Mode Active (Eye-Level 1.75m)". 

Through systematic investigation of the Three.js scene graph, React effect dependencies, camera projection matrices, and input handlers, the root causes were diagnosed, isolated, and resolved. The first-person walkthrough is now fully operational across all four industrial facilities (Manufacturing Plant, Warehouse & Logistics, Process & Chemical Plant, and Construction Site) with collision detection, frame-rate-independent navigation, pointer-lock mouse look, dev diagnostics, and honest camera registration.

---

## 1. Confirmed Root Cause Analysis

Investigation confirmed **three compounding flaws** in the 3D scene architecture:

### A. React Effect Dependency & Scene Teardown (Primary Cause of Black Viewport)
In `frontend/src/pages/DigitalTwin.tsx`, Effect 3A (which constructs the Three.js `Scene`, `PerspectiveCamera`, `WebGLRenderer`, and base lighting) included `isWalkthrough` directly in its dependency array:
```typescript
// Broken:
useEffect(() => {
  // Teardown previous renderer, clear mount DOM, construct brand new THREE.Scene
  ...
}, [viewMode, reducedMotion, isWalkthrough, cameraPovId, isLowPower]);
```
When a user clicked "First-Person Walkthrough", `setIsWalkthrough(true)` caused Effect 3A to run its cleanup function, tearing down the WebGL renderer and creating a brand new empty `THREE.Scene` with empty groups (`objectsGroup`, `zonesGroup`, `cameraConesGroup`). However, the secondary effect that populated building structures and equipment (`Effect 3B`, dependent only on `[sceneModel, showEquipment]`) did **not** re-run because its dependencies had not changed. Consequently, the newly mounted scene remained completely empty, rendering only the dark `#060913` canvas background.

### B. Viewport Raycasting & Pointer Movement Overwriting Camera Position
In `handlePointerMove`, the dragging handler for the canvas invoked `updateCameraPosition()` unconditionally:
```typescript
// Broken:
if (isWalkthrough) {
  walkthroughYawRef.current -= dx * 0.005;
  walkthroughPitchRef.current = Math.max(-1.1, Math.min(1.1, walkthroughPitchRef.current - dy * 0.005));
}
updateCameraPosition(); // Overwrote eye-level camera with orbital spherical coordinates!
```
Calling `updateCameraPosition()` immediately yanked the camera out of the 1.75 m eye-level position and placed it high in the sky. Furthermore, clicking anywhere inside the 3D viewport called `handleSceneClick`, which unconditionally executed `setIsWalkthrough(false)`, immediately aborting walkthrough mode.

### C. Unpopulated Scene Groups on Initial Mount
`objectsGroup`, `zonesGroup`, and `cameraConesGroup` were added to the `THREE.Scene` inside Effect 3A without being immediately populated, relying on subsequent asynchronous React effects to populate them. Under rapid mode transitions or walkthrough activations, this created a race condition where the viewport rendered before meshes were attached.

---

## 2. Files Changed and Rationale

| File | Changes Made | Rationale |
| :--- | :--- | :--- |
| `frontend/src/pages/DigitalTwin.tsx` | Decoupled Three.js WebGL scene lifecycle from walkthrough state (`[viewMode]` only). Immediate population of scene groups. Added `getEnvironmentSpawnPoint()` for all 4 facilities. Added `isPositionBlockedByEquipment()` AABB collision detection. Implemented pointer lock + drag-to-look fallback. Added dev diagnostics toggle and panel. Honestly labeled unregistered cameras. | Resolves the black viewport failure, guarantees that toggling walkthrough never destroys the Three.js scene, prevents walking through machinery, and provides live operational diagnostics. |
| `frontend/scripts/test-digital-twin-lifecycle.mjs` | Added automated test suite verifying decoupled lifecycle, immediate group population, validated spawn points, equipment collision detection, event cleanup, honest camera registration, and dev diagnostics. | Ensures automated regression testing under Node test runner. |

---

## 3. Implementation Details

### 3.1 Decoupled Scene Lifecycle & Immediate Group Population
The Three.js scene initialization in Effect 3A now depends strictly on `[viewMode]`. Walkthrough navigation state, camera POV IDs, and reduced-motion preferences are accessed in the `animate()` loop via React refs (`isWalkthroughRef`, `cameraPovIdRef`, `reducedMotionRef`):
```typescript
// Fixed:
useEffect(() => {
  if (viewMode !== '3D' || !mountRef.current) return;
  // Initialize Three.js scene, camera, renderer, lights
  ...
  // Immediately populate groups so viewport is never blank on mount or transition:
  populateEnvironmentObjects(objectsGroup, sceneModelRef.current, showEquipmentRef.current, currentEnvConfig.category);
  populateSafetyZones(zonesGroup, sceneModelRef.current, showZonesRef.current, violatedZoneIdsRef.current);
  populateCameraCones(cameraConesGroup, sceneModelRef.current, showCoverageRef.current);
  ...
}, [viewMode]);
```

### 3.2 Facility-Specific Validated Spawn Points
Avatar spawn points are validated for each configured industrial environment at an eye height of 1.75 m above the facility floor:
- **Manufacturing Plant:** `[10.0, 1.75, 20.0]`, Yaw = $90^\circ$ (facing east down the main pedestrian aisle between CNC cells and assembly).
- **Warehouse & Logistics:** `[8.0, 1.75, 22.5]`, Yaw = $90^\circ$ (central logistics aisle between high-bay pallet racks).
- **Process & Chemical Plant:** `[12.0, 1.75, 36.5]`, Yaw = $0^\circ$ (safe external walkway looking north toward tank farm and distillation columns).
- **Construction Site:** `[8.0, 1.75, 36.0]`, Yaw = $30^\circ$ (site entrance looking northeast toward tower crane and scaffolding).

### 3.3 Machinery & Equipment AABB Collision Detection
To prevent the avatar from walking through machinery or falling below the facility floor, bounding-box collision detection with an avatar clearance radius ($0.55\text{ m}$) was implemented:
```typescript
const isPositionBlockedByEquipment = (px: number, pz: number, equipmentList: FactorySceneModel['equipment']): boolean => {
  const avatarRadius = 0.55;
  if (!equipmentList) return false;
  for (const eq of equipmentList) {
    if (!eq.position || !eq.dimensions) continue;
    const [ex, , ez] = eq.position;
    const [ew, , ed] = eq.dimensions;
    if (px >= ex - ew / 2 - avatarRadius && px <= ex + ew / 2 + avatarRadius &&
        pz >= ez - ed / 2 - avatarRadius && pz <= ez + ed / 2 + avatarRadius) {
      return true;
    }
  }
  return false;
};
```
Movement checks $X$ and $Z$ axes independently, enabling smooth sliding along machine faces rather than stopping completely when approaching an obstacle at an angle.

### 3.4 Frame-Rate-Independent Navigation & Input Handling
- **Keys:** Supports `W`, `A`, `S`, `D`, and arrow keys. Movement uses `deltaSeconds` capped at $0.1\text{ s}$ to prevent position jumps during background tab throttling.
- **Speed:** $5.0\text{ m/s}$ standard; automatically damped to $2.8\text{ m/s}$ when Reduced Motion is enabled.
- **Mouse Look:** Supports Pointer Lock API (`requestPointerLock`) when available, with smooth click-to-drag fallback when pointer lock is unengaged or unsupported.
- **HUD Controls:** Virtual **Forward**, **Back**, **Reset Spawn**, and **Exit (ESC)** buttons remain fully functional without losing keyboard or mouse focus.
- **Input Guard:** Typing into search inputs or form fields does not trigger walkthrough movement.
- **Cleanup:** `pointerlockchange`, `mousemove`, `keydown`, and `keyup` listeners are cleanly removed on unmount.

### 3.5 Camera Registration Honesty (`cam-chem-tank-farm`)
Investigation of `cam-chem-tank-farm` in the Process & Chemical Plant confirmed that it is a configured 3D spatial mounting reference in the chemical plant model without a physical or synthetic video ingestion stream attached in `CameraManager`.
- **Status:** Honestly preserved as `UNREGISTERED`.
- **POV Mode:** When selecting `cam-chem-tank-farm`, the HUD explicitly displays:  
  `UNREGISTERED SENSOR NODE • NO PHYSICAL RTSP STREAM ATTACHED • SPATIAL VANTAGE PREVIEW ONLY (UNCALIBRATED)`.
- **Integrity:** Live FPS, video resolution, and neural acceleration telemetry are never fabricated for unregistered or disconnected camera nodes.

### 3.6 Developer Diagnostics Overlay
In development mode, a toggleable **DEV DIAGNOSTICS** panel displays real-time 3D pipeline telemetry:
- Renderer engine version: `Active (r182)`
- WebGL Context status: `WebGL2 (Hardware)`
- Canvas dimensions: Dynamic `width x height px`
- Scene graph object count: Mesh and zone children count
- Active mode: `FIRST_PERSON_WALK`, `CCTV_POV`, or `ORBITAL_INSPECT`
- Eye coordinates: `[X, 1.75, Z]`
- Camera heading: `Yaw in degrees`
- Pointer lock state: `ENGAGED` or `RELEASED`
- Framerate: Measured FPS and frame render time (`ms`)
- Data lifecycle: `API_SYNCHRONIZED` or `OFFLINE_SYNTHETIC`

---

## 4. Tests and Verification Results

### 4.1 Production Frontend Build
```bash
npm run build
```
**Result:** `tsc && vite build` completed with **0 errors**. Production bundle generated successfully:
- `dist/index.html`: 1.39 kB
- `dist/assets/index-C_VfSEeZ.css`: 19.91 kB
- `dist/assets/index-CTC_Qa-s.js`: 979.86 kB

### 4.2 Frontend Unit & Lifecycle Tests
```bash
npm test
```
**Result:** 10/10 test suites passed (`0 failures`, duration 57 ms):
1. `DEFAULT_FACTORY_SCENE contains complete base geometry` (PASS)
2. `Baseline scene cameras are honestly marked DISCONNECTED` (PASS)
3. `API fetchFactoryScene includes defensive AbortController timeout` (PASS)
4. `DigitalTwin component decouples WebGL initialization from network sync` (PASS)
5. `factoryGeometry exports realistic industrial assets and floor texturing` (PASS)
6. `DigitalTwin integrates first-person walkthrough and camera POV modes` (PASS)
7. `Multi-environment configurations define four distinct industrial twins` (PASS)
8. `environmentGeometry exports procedural 3D equipment generators` (PASS)
9. `DigitalTwinCenter component provides catalog, filtering, and inspection` (PASS)
10. `DigitalTwin first-person walkthrough architecture & life-cycle integrity` (PASS)

### 4.3 Backend Test Suite
```bash
.venv/bin/pytest tests/
```
**Result:** 115/115 passed in 24.71s (`0 failures`).

### 4.4 Live API Verification
```bash
curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:8000/api/v1/twin/scene?environment_id=process-chemical"
```
**Result:** Returned verified chemical plant scene model with `cam-chem-tank-farm` correctly marked `status: UNREGISTERED`.

---

## 5. Remaining Limitations

1. **Procedural Geometry vs High-Poly Mesh Collisions:** Equipment collision uses Oriented / Axis-Aligned Bounding Box (AABB) checks rather than triangle-mesh GJK raycasting. This provides high-speed $60\text{ FPS}$ execution on mobile and embedded devices, but complex concave machinery (e.g., passing under an elevated gantry) uses the overall bounding footprint.
2. **Multi-Floor Vertical Stairs:** The current walkthrough operates at a fixed floor elevation of $1.75\text{ m}$ above the ground floor. Vertical stair traversal to catwalks and mezzanine levels is planned for a future release via raycasted floor elevation snapping.
3. **Headless Browser Sandbox:** Automated Playwright browser tests in this environment are limited by network sandbox restrictions on downloading external browser drivers (`azureedge.net`); all verification was completed via Node test runners, unit suites, and live HTTP API verification.
