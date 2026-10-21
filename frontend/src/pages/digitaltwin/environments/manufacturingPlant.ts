/**
 * SENTINEL AI — Manufacturing Plant Digital Twin Configuration
 * Environment: Automotive assembly, robotic welding, and precision CNC fabrication facility.
 */

import { DigitalTwinEnvironmentConfig } from '../types';
import { DEFAULT_FACTORY_SCENE } from '../defaultScene';
import { DEMO_SCENES } from '../demoScenarios';

export const MANUFACTURING_PLANT_CONFIG: DigitalTwinEnvironmentConfig = {
  id: 'manufacturing-plant',
  name: 'SENTINEL AI Detroit Plant Alpha',
  category: 'MANUFACTURING',
  subtitle: 'Automotive Stamping, Robotic Welding & CNC Machining',
  description:
    'High-speed automotive fabrication facility featuring Fanuc 6-axis welding cells, KUKA assembly robots, HAAS 5-axis CNC machining bays, and central pedestrian safety walkways.',
  dimensions: {
    width_meters: 60.0,
    depth_meters: 40.0,
    height_meters: 8.5,
  },
  supportedCapabilities: [
    'ROBOTIC_CELL_INTRUSION_DETECTION',
    'PEDESTRIAN_CORRIDOR_COMPLIANCE',
    'HARDHAT_AND_VEST_VERIFICATION',
    'CNC_FLYING_DEBRIS_EXCLUSION',
    'DETERMINISTIC_5FRAME_GATE',
  ],
  status: 'DEMO_BENCHMARK',
  statusLabel: 'ILLUSTRATIVE BENCHMARK LAYOUT',
  sceneModel: DEFAULT_FACTORY_SCENE,
  demoScenarios: DEMO_SCENES,
  provenance: {
    schema_version: '1.0.0',
    author: 'SENTINEL AI Manufacturing Systems Team',
    created_at: '2026-10-21T08:00:00Z',
    coordinate_system: 'Right-handed Y-up metric (meters)',
    site_reference: 'SITE-DETROIT-01-MICH',
  },
};
