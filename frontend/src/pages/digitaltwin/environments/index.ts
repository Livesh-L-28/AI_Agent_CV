/**
 * SENTINEL AI — Digital Twin Environment Configuration Registry
 * Aggregates and validates all 4 industrial plant environment scene models:
 * 1. Manufacturing Plant
 * 2. Warehouse & Logistics
 * 3. Process & Chemical Plant
 * 4. Construction Site
 */

import { DigitalTwinEnvironmentConfig, validateSceneConfiguration } from '../types';
import { MANUFACTURING_PLANT_CONFIG } from './manufacturingPlant';
import { WAREHOUSE_LOGISTICS_CONFIG } from './warehouseLogistics';
import { PROCESS_CHEMICAL_CONFIG } from './processChemical';
import { CONSTRUCTION_SITE_CONFIG } from './constructionSite';

export type { DigitalTwinEnvironmentConfig };
export type { EnvironmentCategory } from '../types';

export {
  MANUFACTURING_PLANT_CONFIG,
  WAREHOUSE_LOGISTICS_CONFIG,
  PROCESS_CHEMICAL_CONFIG,
  CONSTRUCTION_SITE_CONFIG,
};

export const ALL_ENVIRONMENTS: DigitalTwinEnvironmentConfig[] = [
  MANUFACTURING_PLANT_CONFIG,
  WAREHOUSE_LOGISTICS_CONFIG,
  PROCESS_CHEMICAL_CONFIG,
  CONSTRUCTION_SITE_CONFIG,
];

// Validate all configurations on module load
ALL_ENVIRONMENTS.forEach((env) => {
  const result = validateSceneConfiguration(env);
  if (!result.valid) {
    console.error(`Invalid Digital Twin Environment Config [${env.id}]:`, result.errors);
  }
});

export function getEnvironmentById(id: string): DigitalTwinEnvironmentConfig {
  const found = ALL_ENVIRONMENTS.find((e) => e.id === id);
  if (!found) {
    console.warn(`Environment '${id}' not found, falling back to manufacturing-plant`);
    return MANUFACTURING_PLANT_CONFIG;
  }
  return found;
}
