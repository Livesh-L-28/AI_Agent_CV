/**
 * SENTINEL AI — Multi-Environment Digital Twin Architecture Types & Validator
 * Defines versioned, typed configuration schemas for multiple industrial plant environments.
 */

import { FactorySceneModel } from '../../services/api';
import { DemoScene } from './demoScenarios';

export type EnvironmentCategory =
  | 'MANUFACTURING'
  | 'LOGISTICS'
  | 'CHEMICAL'
  | 'CONSTRUCTION';

export type EnvironmentStatus =
  | 'DEMO_BENCHMARK'
  | 'CALIBRATED_SITE'
  | 'OFFLINE_SPEC';

export interface EnvironmentProvenance {
  schema_version: string;
  author: string;
  created_at: string;
  coordinate_system: string; // e.g. 'Right-handed Y-up metric (meters)'
  site_reference: string;
}

export interface DigitalTwinEnvironmentConfig {
  id: string; // Stable unique ID: 'manufacturing-plant', 'warehouse-logistics', etc.
  name: string; // e.g. 'SENTINEL AI Detroit Plant Alpha'
  category: EnvironmentCategory;
  subtitle: string;
  description: string;
  dimensions: {
    width_meters: number;
    depth_meters: number;
    height_meters: number;
  };
  supportedCapabilities: string[];
  status: EnvironmentStatus;
  statusLabel?: string;
  thumbnailSvg?: string;
  sceneModel: FactorySceneModel;
  demoScenarios: DemoScene[];
  provenance: EnvironmentProvenance;
}

export interface ConfigurationValidationError {
  field: string;
  message: string;
}

/**
 * Validates a digital twin environment configuration.
 * Rejects malformed geometry, non-positive dimensions, and duplicated identifiers.
 */
export function validateSceneConfiguration(
  config: unknown
): { valid: boolean; errors: ConfigurationValidationError[] } {
  const errors: ConfigurationValidationError[] = [];

  if (!config || typeof config !== 'object') {
    return {
      valid: false,
      errors: [{ field: 'root', message: 'Environment configuration must be an object' }],
    };
  }

  const c = config as Partial<DigitalTwinEnvironmentConfig>;

  // 1. Core identifiers
  if (!c.id || typeof c.id !== 'string' || !/^[a-z0-9-_]+$/.test(c.id)) {
    errors.push({ field: 'id', message: 'ID must be non-empty alphanumeric with dashes/underscores' });
  }

  if (!c.name || typeof c.name !== 'string' || c.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Name must be a non-empty string' });
  }

  const validCategories: EnvironmentCategory[] = [
    'MANUFACTURING',
    'LOGISTICS',
    'CHEMICAL',
    'CONSTRUCTION',
  ];
  if (!c.category || !validCategories.includes(c.category)) {
    errors.push({
      field: 'category',
      message: `Category must be one of: ${validCategories.join(', ')}`,
    });
  }

  // 2. Physical Dimensions
  if (
    !c.dimensions ||
    typeof c.dimensions.width_meters !== 'number' ||
    c.dimensions.width_meters <= 0 ||
    typeof c.dimensions.depth_meters !== 'number' ||
    c.dimensions.depth_meters <= 0 ||
    typeof c.dimensions.height_meters !== 'number' ||
    c.dimensions.height_meters <= 0
  ) {
    errors.push({
      field: 'dimensions',
      message: 'Physical dimensions (width, depth, height in meters) must all be positive numbers',
    });
  }

  // 3. Scene Model Integrity
  if (!c.sceneModel || typeof c.sceneModel !== 'object') {
    errors.push({ field: 'sceneModel', message: 'Scene model is missing or invalid' });
  } else {
    const sm = c.sceneModel;

    // Check unique equipment IDs
    if (Array.isArray(sm.equipment)) {
      const eqIds = new Set<string>();
      sm.equipment.forEach((eq, idx) => {
        if (!eq.id || eqIds.has(eq.id)) {
          errors.push({ field: `equipment[${idx}].id`, message: `Duplicate or missing equipment ID: ${eq.id}` });
        } else {
          eqIds.add(eq.id);
        }
        if (!Array.isArray(eq.dimensions) || eq.dimensions.length !== 3 || eq.dimensions.some((d) => d <= 0)) {
          errors.push({ field: `equipment[${idx}].dimensions`, message: `Invalid dimensions for equipment ${eq.id}` });
        }
      });
    }

    // Check unique zone IDs and valid polygons (>= 3 points)
    if (Array.isArray(sm.zones)) {
      const zoneIds = new Set<string>();
      sm.zones.forEach((z, idx) => {
        if (!z.zone_id || zoneIds.has(z.zone_id)) {
          errors.push({ field: `zones[${idx}].zone_id`, message: `Duplicate or missing zone ID: ${z.zone_id}` });
        } else {
          zoneIds.add(z.zone_id);
        }
        if (!Array.isArray(z.polygon_meters) || z.polygon_meters.length < 3) {
          errors.push({
            field: `zones[${idx}].polygon_meters`,
            message: `Zone ${z.zone_id} polygon must contain at least 3 coordinate points`,
          });
        }
      });
    }

    // Check unique camera IDs
    if (Array.isArray(sm.cameras)) {
      const camIds = new Set<string>();
      sm.cameras.forEach((cam, idx) => {
        if (!cam.camera_id || camIds.has(cam.camera_id)) {
          errors.push({ field: `cameras[${idx}].camera_id`, message: `Duplicate or missing camera ID: ${cam.camera_id}` });
        } else {
          camIds.add(cam.camera_id);
        }
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
