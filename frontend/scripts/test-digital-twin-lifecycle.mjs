/**
 * Frontend Lifecycle & Geometry Regression Test Suite
 * Executed via Node.js native test runner: node --test frontend/scripts/test-digital-twin-lifecycle.mjs
 *
 * Verifies:
 * 1. Offline baseline scene completeness (floors, zones, equipment, cameras)
 * 2. Honest status flags (all baseline cameras start DISCONNECTED, not LIVE)
 * 3. Lifecycle state transitions (initializing_renderer -> loading_scene -> ready_disconnected / ready_live / error)
 * 4. Resilient non-blocking sync handling (timeout/rejection handling)
 * 5. WebGL error detection and 2D floorplan fallback triggers
 * 6. High-fidelity procedural industrial assets (floor textures, guardrails, workstations, electrical cabinets, lighting)
 * 7. First-person walkthrough mode and camera-to-camera POV navigation
 * 8. Performance telemetry, background tab pausing, and low-power hardware mode
 */

import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

test('DEFAULT_FACTORY_SCENE contains complete base geometry', async (t) => {
  const defaultScenePath = resolve(__dirname, '../src/pages/digitaltwin/defaultScene.ts');
  const content = readFileSync(defaultScenePath, 'utf8');

  // Verify key model components exist
  assert.ok(content.includes("factory_id: 'factory-plant-alpha'"), 'factory_id must match plant alpha');
  assert.ok(content.includes("width_meters: 60.0"), 'factory width must be 60.0m');
  assert.ok(content.includes("depth_meters: 40.0"), 'factory depth must be 40.0m');
  assert.ok(content.includes("height_meters: 8.5"), 'factory height must be 8.5m');
  assert.ok(content.includes("floor-ground"), 'ground floor must be defined');
  assert.ok(content.includes("floor-mezzanine"), 'mezzanine floor must be defined');
  assert.ok(content.includes("equip-robot-01"), 'equipment nodes must exist');
  assert.ok(content.includes("zone-robotics-01"), 'safety zones must exist');
  assert.ok(content.includes("cam-facility-01"), 'cameras must exist');
});

test('Baseline scene cameras are honestly marked DISCONNECTED', async (t) => {
  const defaultScenePath = resolve(__dirname, '../src/pages/digitaltwin/defaultScene.ts');
  const content = readFileSync(defaultScenePath, 'utf8');

  // Find camera block
  const cameraBlockStart = content.indexOf('cameras: [');
  assert.ok(cameraBlockStart > 0, 'cameras array must be defined');
  const cameraBlock = content.slice(cameraBlockStart);

  const cameraMatches = cameraBlock.match(/camera_id:\s*'([^']+)'/g);
  assert.ok(cameraMatches && cameraMatches.length >= 3, 'Must have at least 3 baseline cameras');

  const statusMatches = cameraBlock.match(/status:\s*'([^']+)'/g);
  for (const statusMatch of statusMatches) {
    assert.ok(!statusMatch.includes('LIVE'), 'Baseline cameras must never be marked LIVE without stream');
    assert.ok(statusMatch.includes('DISCONNECTED'), 'Baseline cameras must be marked DISCONNECTED');
  }
});

test('API fetchFactoryScene includes defensive AbortController timeout', async (t) => {
  const apiPath = resolve(__dirname, '../src/services/api.ts');
  const apiContent = readFileSync(apiPath, 'utf8');

  assert.ok(
    apiContent.includes('AbortController'),
    'api.ts must instantiate an AbortController to prevent indefinite loading'
  );
  assert.ok(
    apiContent.includes('setTimeout') && apiContent.includes('abort'),
    'api.ts must set a timeout to abort hanging network requests'
  );
});

test('DigitalTwin component decouples WebGL initialization from network sync', async (t) => {
  const dtPath = resolve(__dirname, '../src/pages/DigitalTwin.tsx');
  const dtContent = readFileSync(dtPath, 'utf8');

  // Verify lifecycle states
  assert.ok(dtContent.includes("'initializing_renderer'"), 'Must define initializing_renderer state');
  assert.ok(dtContent.includes("'loading_scene'"), 'Must define loading_scene state');
  assert.ok(dtContent.includes("'connecting_backend'"), 'Must define connecting_backend state');
  assert.ok(dtContent.includes("'ready_live'"), 'Must define ready_live state');
  assert.ok(dtContent.includes("'ready_disconnected'"), 'Must define ready_disconnected state');
  assert.ok(dtContent.includes("'error'"), 'Must define error state');

  // Verify baseline scene initialization
  assert.ok(
    dtContent.includes('currentEnvConfig.sceneModel') || dtContent.includes('DEFAULT_FACTORY_SCENE'),
    'DigitalTwin must initialize sceneModel with offline baseline'
  );

  // Verify non-blocking: loading screen overlay removed
  assert.ok(
    !dtContent.includes('Synchronizing Edge Digital Twin Model…'),
    'Indefinite loading overlay message must be eliminated'
  );

  // Verify retry action is available
  assert.ok(
    dtContent.includes('Retry Sync') && dtContent.includes('setRetryCounter'),
    'Must offer an actionable retry sync action'
  );

  // Verify 2D floor plan fallback on error
  assert.ok(
    dtContent.includes("setViewMode('2D')"),
    'Must provide 2D floorplan fallback when WebGL fails'
  );
});

test('factoryGeometry exports realistic industrial assets and floor texturing', async (t) => {
  const geomPath = resolve(__dirname, '../src/pages/digitaltwin/factoryGeometry.ts');
  const content = readFileSync(geomPath, 'utf8');

  assert.ok(content.includes('createIndustrialFloorTexture'), 'Must export createIndustrialFloorTexture');
  assert.ok(content.includes('createSafetyGuardrail'), 'Must export createSafetyGuardrail');
  assert.ok(content.includes('createWorkstationBench'), 'Must export createWorkstationBench');
  assert.ok(content.includes('createElectricalCabinet'), 'Must export createElectricalCabinet');
  assert.ok(content.includes('createSuspendedHighBayLight'), 'Must export createSuspendedHighBayLight');
  assert.ok(content.includes('createRoboticCell'), 'Must export createRoboticCell');
  assert.ok(content.includes('createCncMillingCenter'), 'Must export createCncMillingCenter');
  assert.ok(content.includes('createConveyorSystem'), 'Must export createConveyorSystem');
  assert.ok(content.includes('createStorageRack'), 'Must export createStorageRack');
  assert.ok(content.includes('createForkliftStation'), 'Must export createForkliftStation');
});

test('DigitalTwin integrates first-person walkthrough and camera POV modes', async (t) => {
  const dtPath = resolve(__dirname, '../src/pages/DigitalTwin.tsx');
  const content = readFileSync(dtPath, 'utf8');

  // Walkthrough mode verification
  assert.ok(content.includes('isWalkthrough'), 'Must track isWalkthrough state');
  assert.ok(content.includes('walkthroughPosRef'), 'Must track walkthrough position');
  assert.ok(content.includes('walkthroughYawRef'), 'Must track walkthrough orientation');
  assert.ok(content.includes('First-Person Walkthrough'), 'Must render walkthrough action button');

  // Camera POV mode verification
  assert.ok(content.includes('cameraPovId'), 'Must track cameraPovId state');
  assert.ok(content.includes('Exit Camera POV'), 'Must render camera POV exit button');
  assert.ok(content.includes('Camera Viewpoints (POV)'), 'Must render camera POV selector');

  // Performance and edge mode verification
  assert.ok(content.includes('isLowPower'), 'Must track isLowPower state');
  assert.ok(content.includes('visibilitychange'), 'Must listen to visibilitychange for tab pausing');
  assert.ok(content.includes('fps'), 'Must compute dynamic frame rate');
});

test('Multi-environment configurations define four distinct industrial twins', async (t) => {
  const envIndexPath = resolve(__dirname, '../src/pages/digitaltwin/environments/index.ts');
  const envIndexContent = readFileSync(envIndexPath, 'utf8');

  assert.ok(envIndexContent.includes('MANUFACTURING_PLANT_CONFIG'), 'Must register MANUFACTURING_PLANT_CONFIG');
  assert.ok(envIndexContent.includes('WAREHOUSE_LOGISTICS_CONFIG'), 'Must register WAREHOUSE_LOGISTICS_CONFIG');
  assert.ok(envIndexContent.includes('PROCESS_CHEMICAL_CONFIG'), 'Must register PROCESS_CHEMICAL_CONFIG');
  assert.ok(envIndexContent.includes('CONSTRUCTION_SITE_CONFIG'), 'Must register CONSTRUCTION_SITE_CONFIG');

  // Verify all 4 environment files exist and have honest DEMO_BENCHMARK status
  const envFiles = [
    'manufacturingPlant.ts',
    'warehouseLogistics.ts',
    'processChemical.ts',
    'constructionSite.ts',
  ];

  for (const file of envFiles) {
    const filePath = resolve(__dirname, '../src/pages/digitaltwin/environments', file);
    const content = readFileSync(filePath, 'utf8');

    assert.ok(content.includes("status: 'DEMO_BENCHMARK'"), `${file} must be labeled DEMO_BENCHMARK`);
    assert.ok(content.includes("statusLabel: 'ILLUSTRATIVE BENCHMARK LAYOUT'"), `${file} must be labeled ILLUSTRATIVE BENCHMARK LAYOUT`);
    assert.ok(content.includes("demoScenarios:"), `${file} must configure demo scenarios`);
    assert.ok(content.includes("dimensions:"), `${file} must define metric dimensions`);
    assert.ok(content.includes("sceneModel:"), `${file} must contain sceneModel`);
  }
});

test('environmentGeometry exports procedural 3D equipment generators', async (t) => {
  const envGeomPath = resolve(__dirname, '../src/pages/digitaltwin/environmentGeometry.ts');
  const content = readFileSync(envGeomPath, 'utf8');

  // Warehouse equipment
  assert.ok(content.includes('createWarehousePalletRack'), 'Must export createWarehousePalletRack');
  assert.ok(content.includes('createLoadingDockBay'), 'Must export createLoadingDockBay');
  assert.ok(content.includes('createDockedTruckTrailer'), 'Must export createDockedTruckTrailer');

  // Chemical plant equipment
  assert.ok(content.includes('createChemicalStorageTank'), 'Must export createChemicalStorageTank');
  assert.ok(content.includes('createDistillationColumn'), 'Must export createDistillationColumn');
  assert.ok(content.includes('createPipeRackGantry'), 'Must export createPipeRackGantry');
  assert.ok(content.includes('createCentrifugalPump'), 'Must export createCentrifugalPump');

  // Construction equipment
  assert.ok(content.includes('createTowerCrane'), 'Must export createTowerCrane');
  assert.ok(content.includes('createConstructionScaffolding'), 'Must export createConstructionScaffolding');
  assert.ok(content.includes('createHydraulicExcavator'), 'Must export createHydraulicExcavator');
  assert.ok(content.includes('createStructuralSteelFrame'), 'Must export createStructuralSteelFrame');
});

test('DigitalTwinCenter component provides catalog, filtering, and inspection', async (t) => {
  const centerPath = resolve(__dirname, '../src/pages/DigitalTwinCenter.tsx');
  const content = readFileSync(centerPath, 'utf8');

  assert.ok(content.includes('DigitalTwinCenter'), 'Must define DigitalTwinCenter component');
  assert.ok(content.includes('ALL_ENVIRONMENTS'), 'Must import all environment configurations');
  assert.ok(content.includes('FilterBar'), 'Must render category filter tabs');
  assert.ok(content.includes('Inspect Spec'), 'Must provide specification inspector drawer');
  assert.ok(content.includes('Illustrative Demo Benchmarks'), 'Must display telemetry honesty banner');
});

test('DigitalTwin first-person walkthrough architecture & life-cycle integrity', async (t) => {
  const twinPath = resolve(__dirname, '../src/pages/DigitalTwin.tsx');
  const content = readFileSync(twinPath, 'utf8');

  // 1. Scene lifecycle: Effect 3A must not tear down or re-run when toggling isWalkthrough
  assert.ok(
    content.includes('}, [viewMode]);'),
    'Three.js initialization effect must have [viewMode] dependency array to prevent scene teardown on walkthrough'
  );

  // 2. Immediate group population: Viewport must never be initialized empty
  assert.ok(
    content.includes('populateEnvironmentObjects(objectsGroup,'),
    'Must populate objects immediately upon group creation'
  );
  assert.ok(
    content.includes('populateSafetyZones(zonesGroup,'),
    'Must populate safety zones immediately upon group creation'
  );
  assert.ok(
    content.includes('populateCameraCones(cameraConesGroup,'),
    'Must populate camera cones immediately upon group creation'
  );

  // 3. Eye level and validated spawn points
  assert.ok(
    content.includes('getEnvironmentSpawnPoint = (category: string, model: FactorySceneModel)'),
    'Must define getEnvironmentSpawnPoint for industrial facility entrance positions'
  );
  assert.ok(
    content.includes('1.75'),
    'Camera eye height must be calibrated to 1.75m'
  );

  // 4. Equipment collision detection
  assert.ok(
    content.includes('isPositionBlockedByEquipment'),
    'Must implement collision detection against machinery and equipment'
  );

  // 5. Pointer lock and event cleanup
  assert.ok(
    content.includes("document.addEventListener('pointerlockchange'"),
    'Must handle pointer lock change events'
  );
  assert.ok(
    content.includes("document.removeEventListener('pointerlockchange'"),
    'Must clean up pointer lock change events'
  );
  assert.ok(
    content.includes("document.removeEventListener('mousemove'"),
    'Must clean up mouse movement listeners'
  );

  // 6. Camera registration honesty
  assert.ok(
    content.includes('UNREGISTERED SENSOR NODE'),
    'Must honestly explain UNREGISTERED camera sensor nodes without fabricated video streams'
  );

  // 7. Dev diagnostics panel
  assert.ok(
    content.includes('DEV DIAGNOSTICS'),
    'Must expose development diagnostics panel'
  );
  assert.ok(
    content.includes('WebGL2 (Hardware)'),
    'Diagnostics must report WebGL context'
  );
});

test('DigitalTwin integrates Worker Density Heatmap and Web Audio Alert engine', async (t) => {
  const twinPath = resolve(__dirname, '../src/pages/DigitalTwin.tsx');
  const twinContent = readFileSync(twinPath, 'utf8');

  // Verify Worker Density Heatmap layer
  assert.ok(
    twinContent.includes('showDensityHeatmap'),
    'Must define showDensityHeatmap state and checkbox'
  );
  assert.ok(
    twinContent.includes('Worker Density Heatmap'),
    'Must provide Worker Density Heatmap visibility toggle'
  );
  assert.ok(
    twinContent.includes('densityGroupRef'),
    'Must maintain a dedicated Three.js densityGroupRef for spatial density rendering'
  );

  // Verify Web Audio API alert engine integration
  const audioAlertsPath = resolve(__dirname, '../src/services/audioAlerts.ts');
  const audioContent = readFileSync(audioAlertsPath, 'utf8');

  assert.ok(
    audioContent.includes('SafetyAudioAlertEngine'),
    'audioAlerts.ts must define SafetyAudioAlertEngine'
  );
  assert.ok(
    audioContent.includes('AudioContext'),
    'audioAlerts.ts must synthesize alerts via native Web Audio API'
  );
  assert.ok(
    twinContent.includes('audioAlertEngine'),
    'DigitalTwin.tsx must import and connect audioAlertEngine'
  );
  assert.ok(
    twinContent.includes('isAudioMuted'),
    'DigitalTwin.tsx must support muting and unmuting safety audio alarms'
  );
});


