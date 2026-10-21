/**
 * SENTINEL AI — Digital Twin Cinematic Demonstration Scenarios & State Machine
 * Deterministic timeline definitions, camera keyframes, worker path waypoints,
 * and simulated incident metadata.
 */

export interface DemoScene {
  id: string;
  index: number;
  number: number;
  title: string;
  subtitle: string;
  startTime: number;
  endTime: number;
  description: string;
  cameraStart: [number, number, number];
  cameraEnd: [number, number, number];
  targetStart: [number, number, number];
  targetEnd: [number, number, number];
}

export const DEMO_TOTAL_DURATION = 72.0; // Total demo duration in seconds

export const DEMO_SCENES: DemoScene[] = [
  {
    id: 'factory_initialization',
    index: 0,
    number: 1,
    title: 'Factory Initialization & Spatial Model Loading',
    subtitle: 'Ground-plane coordinate grid, calibrated equipment footprints, and spatial boundaries reveal',
    startTime: 0.0,
    endTime: 8.0,
    description: 'Autonomous edge model synchronization. Factory floor geometry (60m x 40m) and calibrated safety zones online.',
    cameraStart: [48.0, 44.0, 56.0],
    cameraEnd: [28.0, 24.0, 38.0],
    targetStart: [30.0, 0.0, 20.0],
    targetEnd: [25.0, 0.0, 18.0],
  },
  {
    id: 'camera_activation',
    index: 1,
    number: 2,
    title: 'Camera Network & Optical Gate Activation',
    subtitle: 'Overhead North Robotic Bay Camera (cam-facility-01) active with authentic YOLO MPS inference',
    startTime: 8.0,
    endTime: 18.0,
    description: 'Camera sensor online with 80° horizontal FOV. Real-time Apple MPS hardware inference streaming at ~24 FPS.',
    cameraStart: [28.0, 24.0, 38.0],
    cameraEnd: [17.0, 15.0, 20.0],
    targetStart: [25.0, 0.0, 18.0],
    targetEnd: [17.0, 2.0, 14.0],
  },
  {
    id: 'worker_tracking',
    index: 2,
    number: 3,
    title: 'Synthetic Worker Ingestion & Spatial Tracking',
    subtitle: 'Worker #SIM-884 enters transit walkway with real-time ground-contact projection',
    startTime: 18.0,
    endTime: 32.0,
    description: 'Spatial coordinate mapping via Planar Homography. Generating high-visibility motion trail across factory corridor.',
    cameraStart: [17.0, 15.0, 20.0],
    cameraEnd: [22.0, 13.0, 24.0],
    targetStart: [17.0, 2.0, 14.0],
    targetEnd: [17.0, 1.0, 17.0],
  },
  {
    id: 'zone_event',
    index: 3,
    number: 4,
    title: 'Restricted-Zone Breach & Tripwire Event',
    subtitle: 'Worker #SIM-884 crosses exclusion perimeter into Welding Cell A (Fanuc 6-Axis Robotic Bay)',
    startTime: 32.0,
    endTime: 45.0,
    description: 'Deterministic Safety Rule RULE_NO_PEDESTRIANS triggered after 5-frame persistence confirmation. Zone perimeter pulsing red.',
    cameraStart: [22.0, 13.0, 24.0],
    cameraEnd: [19.0, 11.0, 21.0],
    targetStart: [17.0, 1.0, 17.0],
    targetEnd: [17.0, 0.5, 13.5],
  },
  {
    id: 'incident_investigation',
    index: 4,
    number: 5,
    title: 'Multi-Agent Investigation & Evidence Grounding',
    subtitle: 'Cognitive reasoning trace cites keyframe evidence with deterministic safeguard verification',
    startTime: 45.0,
    endTime: 60.0,
    description: 'Agent Investigator grounds tripwire evidence with 96% confidence. Human-in-the-loop review drawer presented for verification.',
    cameraStart: [19.0, 11.0, 21.0],
    cameraEnd: [15.0, 9.0, 17.5],
    targetStart: [17.0, 0.5, 13.5],
    targetEnd: [17.0, 0.5, 13.5],
  },
  {
    id: 'factory_overview',
    index: 5,
    number: 6,
    title: 'Factory-Wide Overview & System Integrity Summary',
    subtitle: 'Complete 3D spatial twin telemetry, continuous perimeter safety, and edge-readiness summary',
    startTime: 60.0,
    endTime: 72.0,
    description: 'All 4 plant zones monitored. Zero false positives through temporal filtering. Ready for industrial partner deployment.',
    cameraStart: [15.0, 9.0, 17.5],
    cameraEnd: [52.0, 42.0, 58.0],
    targetStart: [17.0, 0.5, 13.5],
    targetEnd: [30.0, 0.0, 20.0],
  },
];

/**
 * Worker motion path waypoints during demo:
 * Time 18s -> starts at (8.0, 0, 20.0) [on central walkway]
 * Time 24s -> walks along corridor to (17.0, 0, 20.0)
 * Time 32s -> turns north towards robot cell to (17.0, 0, 18.0) [zone perimeter]
 * Time 38s -> steps inside cell to (17.0, 0, 13.5) [restricted zone center]
 * Time 38-60s -> stationary in violation at (17.0, 0, 13.5)
 */
export function getSyntheticWorkerPosition(
  time: number,
  environmentCategory: string = 'MANUFACTURING'
): {
  x: number;
  y: number;
  z: number;
  active: boolean;
  inViolation: boolean;
  trail: Array<[number, number]>;
} {
  if (time < 18.0 || time > 60.0) {
    return { x: 0, y: -100, z: 0, active: false, inViolation: false, trail: [] };
  }

  let x = 8.0;
  let z = 20.0;
  let inViolation = false;

  if (environmentCategory === 'LOGISTICS') {
    // Warehouse worker enters forklift lane
    if (time <= 24.0) {
      const t = (time - 18.0) / 6.0;
      x = 15.0 + t * (25.0 - 15.0);
      z = 28.0;
    } else if (time <= 32.0) {
      const t = (time - 24.0) / 8.0;
      x = 25.0;
      z = 28.0 - t * (28.0 - 25.0);
    } else if (time <= 38.0) {
      const t = (time - 32.0) / 6.0;
      x = 25.0 + t * (27.0 - 25.0);
      z = 25.0 - t * (25.0 - 22.0);
      inViolation = true;
    } else {
      x = 27.0;
      z = 22.0;
      inViolation = true;
    }
  } else if (environmentCategory === 'CHEMICAL') {
    // Chemical worker enters secondary containment bund
    if (time <= 24.0) {
      const t = (time - 18.0) / 6.0;
      x = 20.0 - t * (20.0 - 18.0);
      z = 32.0 - t * (32.0 - 26.0);
    } else if (time <= 32.0) {
      const t = (time - 24.0) / 8.0;
      x = 18.0 - t * (18.0 - 16.0);
      z = 26.0 - t * (26.0 - 21.0);
    } else if (time <= 38.0) {
      const t = (time - 32.0) / 6.0;
      x = 16.0 - t * (16.0 - 14.0);
      z = 21.0 - t * (21.0 - 17.0);
      inViolation = true;
    } else {
      x = 14.0;
      z = 17.0;
      inViolation = true;
    }
  } else if (environmentCategory === 'CONSTRUCTION') {
    // Construction worker enters crane drop zone
    if (time <= 24.0) {
      const t = (time - 18.0) / 6.0;
      x = 25.0 - t * (25.0 - 20.0);
      z = 34.0 - t * (34.0 - 28.0);
    } else if (time <= 32.0) {
      const t = (time - 24.0) / 8.0;
      x = 20.0;
      z = 28.0 - t * (28.0 - 22.0);
    } else if (time <= 38.0) {
      const t = (time - 32.0) / 6.0;
      x = 20.0 - t * (20.0 - 18.0);
      z = 22.0 - t * (22.0 - 17.0);
      inViolation = true;
    } else {
      x = 18.0;
      z = 17.0;
      inViolation = true;
    }
  } else {
    // Default Manufacturing: Worker walks into robotic cell
    if (time <= 24.0) {
      const t = (time - 18.0) / 6.0;
      x = 8.0 + t * (17.0 - 8.0);
      z = 20.0;
    } else if (time <= 32.0) {
      const t = (time - 24.0) / 8.0;
      x = 17.0;
      z = 20.0 - t * (20.0 - 18.0);
    } else if (time <= 38.0) {
      const t = (time - 32.0) / 6.0;
      x = 17.0;
      z = 18.0 - t * (18.0 - 13.5);
      inViolation = true;
    } else {
      x = 17.0;
      z = 13.5;
      inViolation = true;
    }
  }

  // Pre-generate trail based on elapsed path
  const trail: Array<[number, number]> = [[x, z]];

  return {
    x,
    y: 0.0,
    z,
    active: true,
    inViolation,
    trail,
  };
}

/**
 * Calculates current camera position and target LookAt with smooth easing.
 */
export function getDemoCameraTransform(
  time: number,
  reducedMotion: boolean = false,
  scenes: DemoScene[] = DEMO_SCENES
): {
  cameraPos: [number, number, number];
  targetPos: [number, number, number];
  currentScene: DemoScene;
  sceneProgress: number; // 0.0 to 1.0 within active scene
  overallProgress: number; // 0.0 to 1.0 across total demo
} {
  const activeScenes = scenes && scenes.length > 0 ? scenes : DEMO_SCENES;
  const clampedTime = Math.max(0, Math.min(DEMO_TOTAL_DURATION, time));
  const overallProgress = clampedTime / DEMO_TOTAL_DURATION;

  const currentScene =
    activeScenes.find((s) => clampedTime >= s.startTime && clampedTime < s.endTime) ||
    activeScenes[activeScenes.length - 1];

  const duration = currentScene.endTime - currentScene.startTime || 1.0;
  const rawProgress = (clampedTime - currentScene.startTime) / duration;
  const sceneProgress = Math.max(0, Math.min(1.0, rawProgress));

  // Smooth Hermite / S-curve interpolation
  const easeProgress = reducedMotion
    ? sceneProgress > 0.5 ? 1.0 : 0.0
    : sceneProgress * sceneProgress * (3.0 - 2.0 * sceneProgress);

  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  const cameraPos: [number, number, number] = [
    lerp(currentScene.cameraStart[0], currentScene.cameraEnd[0], easeProgress),
    lerp(currentScene.cameraStart[1], currentScene.cameraEnd[1], easeProgress),
    lerp(currentScene.cameraStart[2], currentScene.cameraEnd[2], easeProgress),
  ];

  const targetPos: [number, number, number] = [
    lerp(currentScene.targetStart[0], currentScene.targetEnd[0], easeProgress),
    lerp(currentScene.targetStart[1], currentScene.targetEnd[1], easeProgress),
    lerp(currentScene.targetStart[2], currentScene.targetEnd[2], easeProgress),
  ];

  return {
    cameraPos,
    targetPos,
    currentScene,
    sceneProgress,
    overallProgress,
  };
}

/**
 * Simulated Demonstration Incident Card & Provenance generator by environment
 */
export function getDemoIncidentPayload(environmentCategory: string = 'MANUFACTURING') {
  if (environmentCategory === 'LOGISTICS') {
    return {
      incident_id: 'SIM-INC-WH-204',
      event_id: 'evt_sim_forklift_lane_204',
      title: 'Pedestrian in Active Forklift Transit Aisle Without Safety Vest',
      severity: 'HIGH',
      status: 'UNDER_REVIEW',
      rule_id: 'RULE_HIGH_VISIBILITY_VEST_REQUIRED',
      rule_name: 'OSHA 1910.178 — Powered Industrial Truck Transit Aisle PPE Protocol',
      camera_id: 'cam-wh-overhead-01',
      camera_name: 'Aisle 1 & 2 Overhead Surveillance Camera',
      zone_id: 'zone-forklift-traffic',
      zone_name: 'Forklift Operations High-Traffic Aisle',
      track_id: 204,
      worker_alias: 'Worker #SIM-204',
      persistence_frames: 5,
      confidence: 0.938,
      timestamp_utc: '2026-10-21 10:48:12 UTC',
      evidence_citations: ['det_frame_112', 'det_frame_113', 'det_frame_114'],
      agent_summary:
        'Ground mapping confirmed pedestrian presence in primary AGV/forklift transit lane without required high-visibility garment. Fleet interlock pause issued.',
    };
  }

  if (environmentCategory === 'CHEMICAL') {
    return {
      incident_id: 'SIM-INC-CH-712',
      event_id: 'evt_sim_chemical_bund_712',
      title: 'Secondary Containment Bund Intrusion Without Respiratory Gear',
      severity: 'CRITICAL',
      status: 'UNDER_REVIEW',
      rule_id: 'RULE_RESPIRATORY_PPE_REQUIRED',
      rule_name: 'OSHA 1910.120 — Hazardous Waste Operations and Emergency Response Standard',
      camera_id: 'cam-chem-tank-farm',
      camera_name: 'Tank Farm Panoramic Surveillance Camera',
      zone_id: 'zone-tank-bund',
      zone_name: 'Chemical Tank Secondary Containment Bund',
      track_id: 712,
      worker_alias: 'Worker #SIM-712',
      persistence_frames: 5,
      confidence: 0.956,
      timestamp_utc: '2026-10-21 10:48:12 UTC',
      evidence_citations: ['det_frame_204', 'det_frame_205', 'det_frame_206'],
      agent_summary:
        'Personnel presence detected inside volatile organic fluid bund barrier without respiratory equipment. Emergency isolation interlock triggered.',
    };
  }

  if (environmentCategory === 'CONSTRUCTION') {
    return {
      incident_id: 'SIM-INC-CS-519',
      event_id: 'evt_sim_crane_drop_519',
      title: 'Worker in Overhead Crane Swing Radius Under Suspended Load',
      severity: 'CRITICAL',
      status: 'UNDER_REVIEW',
      rule_id: 'RULE_OVERHEAD_CRANE_DROP_HAZARD',
      rule_name: 'OSHA 1926.1424 — Work-Area Control for Cranes and Derricks in Construction',
      camera_id: 'cam-const-crane-overhead',
      camera_name: 'Crane Mast Optical Surveillance Sensor',
      zone_id: 'zone-crane-swing',
      zone_name: 'Overhead Crane Swing Radius & Drop Zone',
      track_id: 519,
      worker_alias: 'Worker #SIM-519',
      persistence_frames: 5,
      confidence: 0.964,
      timestamp_utc: '2026-10-21 10:48:12 UTC',
      evidence_citations: ['det_frame_310', 'det_frame_311', 'det_frame_312'],
      agent_summary:
        'Worker tracked directly beneath suspended structural steel payload inside crane slewing radius. Audible site beacon alerted; hoist rotation brake engaged.',
    };
  }

  return DEMO_INCIDENT_PAYLOAD;
}

export const DEMO_INCIDENT_PAYLOAD = {
  incident_id: 'SIM-INC-884',
  event_id: 'evt_sim_zone_entry_884',
  title: 'Unauthorized Entry into Robotic Welding Cell A',
  severity: 'CRITICAL',
  status: 'UNDER_REVIEW',
  rule_id: 'RULE_NO_PEDESTRIANS',
  rule_name: 'OSHA 1910.212 — Moving Machinery Enclosure Safety Interlock',
  camera_id: 'cam-facility-01',
  camera_name: 'Overhead North Robotic Bay Camera',
  zone_id: 'zone-robotics-01',
  zone_name: 'Welding Cell A Exclusion Zone',
  track_id: 884,
  worker_alias: 'Worker #SIM-884',
  persistence_frames: 5,
  confidence: 0.942,
  timestamp_utc: '2026-10-21 10:48:12 UTC',
  evidence_citations: ['det_frame_042', 'det_frame_043', 'det_frame_044'],
  agent_summary:
    'Spatial tracking confirmed ground contact inside the perimeter of active Fanuc robotic cell. Temporal persistence threshold satisfied. Human-in-the-loop acknowledgment advised.',
};

