/**
 * SENTINEL AI — Digital Twin Center
 * Responsive multi-environment catalog for selecting and launching 3D industrial plant twins:
 * 1. Manufacturing Plant
 * 2. Warehouse & Logistics
 * 3. Process & Chemical Plant
 * 4. Construction Site
 */

import React, { useState } from 'react';
import {
  Factory,
  Package,
  Flame,
  HardHat,
  Box,
  Play,
  Sliders,
  ArrowRight,
  Info,
} from 'lucide-react';
import { ALL_ENVIRONMENTS, DigitalTwinEnvironmentConfig } from './digitaltwin/environments';
import { StatusBadge } from '../components/StatusBadge';
import { FilterBar } from '../components/FilterBar';
import { KpiCard } from '../components/KpiCard';
import { Drawer } from '../components/Drawer';

interface DigitalTwinCenterProps {
  onOpenTwin: (environmentId: string) => void;
  activeEnvironmentId?: string;
}

export const DigitalTwinCenter: React.FC<DigitalTwinCenterProps> = ({
  onOpenTwin,
  activeEnvironmentId = 'manufacturing-plant',
}) => {
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [inspectingConfig, setInspectingConfig] = useState<DigitalTwinEnvironmentConfig | null>(null);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'MANUFACTURING':
        return Factory;
      case 'LOGISTICS':
        return Package;
      case 'CHEMICAL':
        return Flame;
      case 'CONSTRUCTION':
        return HardHat;
      default:
        return Box;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'MANUFACTURING':
        return 'var(--accent-cyan)';
      case 'LOGISTICS':
        return 'var(--status-warning)';
      case 'CHEMICAL':
        return '#ec4899'; // Magenta / chemical
      case 'CONSTRUCTION':
        return '#f97316'; // Safety orange
      default:
        return 'var(--text-secondary)';
    }
  };

  const filterTabs = [
    { id: 'ALL', label: 'All Industrial Sectors', count: ALL_ENVIRONMENTS.length },
    {
      id: 'MANUFACTURING',
      label: 'Manufacturing',
      count: ALL_ENVIRONMENTS.filter((e) => e.category === 'MANUFACTURING').length,
    },
    {
      id: 'LOGISTICS',
      label: 'Logistics & Warehousing',
      count: ALL_ENVIRONMENTS.filter((e) => e.category === 'LOGISTICS').length,
    },
    {
      id: 'CHEMICAL',
      label: 'Process & Chemical',
      count: ALL_ENVIRONMENTS.filter((e) => e.category === 'CHEMICAL').length,
    },
    {
      id: 'CONSTRUCTION',
      label: 'Civil & Construction',
      count: ALL_ENVIRONMENTS.filter((e) => e.category === 'CONSTRUCTION').length,
    },
  ];

  const filteredEnvironments = ALL_ENVIRONMENTS.filter((env) => {
    const matchesSector = selectedSector === 'ALL' || env.category === selectedSector;
    const matchesSearch =
      env.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      env.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      env.subtitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      env.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSector && matchesSearch;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header Banner */}
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              Digital Twin Operations Center
            </h2>
            <StatusBadge status="INFO" label="4 CONFIGURABLE SECTORS" />
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            High-fidelity 3D spatial plant visualization, calibrated camera coverage cones, and real-time safety boundary monitoring across diverse industrial environments.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ textAlign: 'right', fontSize: 12 }}>
            <span style={{ color: 'var(--text-muted)' }}>Coordinate Standard:</span>{' '}
            <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>Metric Y-Up [m]</strong>
            <br />
            <span style={{ color: 'var(--text-muted)' }}>Status:</span>{' '}
            <span style={{ color: 'var(--status-warning)' }}>Illustrative Demo Benchmarks</span>
          </div>
        </div>
      </div>

      {/* KPI Overview Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <KpiCard
          title="Configured Environments"
          value="4 Distinct Sectors"
          subtitle="Manufacturing, Logistics, Chemical, Construction"
          borderColor="var(--accent-cyan)"
        />
        <KpiCard
          title="Total Monitored Footprint"
          value="10,250 m²"
          subtitle="Combined floor area across 4 facilities"
          borderColor="var(--status-success)"
        />
        <KpiCard
          title="Configured Surveillance Cameras"
          value="9 Sensor Nodes"
          subtitle="Calibrated metric ground homography projections"
          borderColor="var(--accent-blue)"
        />
        <KpiCard
          title="Safety Rule Boundaries"
          value="13 Spatial Zones"
          subtitle="Exclusion perimeters & PPE compliance gates"
          borderColor="var(--status-danger)"
        />
      </div>

      {/* Filter and Search Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search environments by name, sector, or equipment…"
        filterOptions={filterTabs}
        activeFilter={selectedSector}
        onFilterChange={setSelectedSector}
      />

      {/* Environments Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', gap: 20 }}>
        {filteredEnvironments.map((env) => {
          const Icon = getCategoryIcon(env.category);
          const accentColor = getCategoryColor(env.category);
          const isCurrentlyActive = env.id === activeEnvironmentId;

          return (
            <div
              key={env.id}
              className="kpi-card"
              style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                padding: '24px',
                borderLeft: `4px solid ${accentColor}`,
                position: 'relative',
                transition: 'transform 0.15s ease, border-color 0.15s ease',
              }}
            >
              <div>
                {/* Header Row: Category Badge & Status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--border-color)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: accentColor,
                      }}
                    >
                      <Icon size={18} />
                    </div>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: accentColor, letterSpacing: '0.5px' }}>
                        {env.category}
                      </span>
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {env.provenance.site_reference}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {isCurrentlyActive && (
                      <span className="badge badge-success" style={{ fontSize: 10 }}>
                        CURRENTLY LOADED
                      </span>
                    )}
                    <span className="badge badge-warning" style={{ fontSize: 10 }}>
                      DEMO BENCHMARK
                    </span>
                  </div>
                </div>

                {/* Title & Subtitle */}
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px 0', color: 'var(--text-primary)' }}>
                  {env.name}
                </h3>
                <div style={{ fontSize: 13, color: 'var(--accent-cyan)', fontWeight: 500, marginBottom: 12 }}>
                  {env.subtitle}
                </div>

                {/* Description */}
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 16px 0' }}>
                  {env.description}
                </p>

                {/* Specification Badges */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 8,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 12px',
                    marginBottom: 16,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Dimensions</div>
                    <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {env.dimensions.width_meters}m × {env.dimensions.depth_meters}m
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Cameras</div>
                    <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {env.sceneModel.cameras.length} Calibrated
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Safety Zones</div>
                    <div style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>
                      {env.sceneModel.zones.length} Boundaries
                    </div>
                  </div>
                </div>

                {/* Supported Capabilities */}
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    VERIFIED SAFETY CAPABILITIES
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {env.supportedCapabilities.map((cap) => (
                      <span
                        key={cap}
                        style={{
                          fontSize: 10,
                          padding: '3px 8px',
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid var(--border-color)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-secondary)',
                          fontFamily: 'var(--font-mono)',
                        }}
                      >
                        {cap.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Action Buttons Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: 16,
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ fontSize: 12, padding: '6px 12px' }}
                  onClick={() => setInspectingConfig(env)}
                >
                  <Sliders size={13} />
                  <span>Inspect Spec</span>
                </button>

                <button
                  type="button"
                  id={`btn-open-twin-${env.id}`}
                  className="btn btn-primary"
                  style={{
                    background: `linear-gradient(135deg, ${accentColor} 0%, var(--accent-blue) 100%)`,
                    color: '#060913',
                    fontWeight: 700,
                    border: 'none',
                    fontSize: 13,
                    padding: '8px 18px',
                  }}
                  onClick={() => onOpenTwin(env.id)}
                >
                  <Play size={13} fill="#060913" />
                  <span>Open 3D Twin</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Configuration Inspector Slide-Out Drawer */}
      <Drawer
        isOpen={inspectingConfig !== null}
        onClose={() => setInspectingConfig(null)}
        title={`Environment Specification — ${inspectingConfig?.name}`}
        width={540}
      >
        {inspectingConfig && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Notice */}
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid var(--accent-cyan)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 10,
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              <Info size={16} color="var(--accent-cyan)" style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong style={{ color: 'var(--accent-cyan)' }}>Authoritative Specification:</strong> All geometry,
                calibrated camera nodes, and polygon coordinates comply with the SENTINEL AI FactorySceneModel schema.
              </div>
            </div>

            {/* Provenance Metadata */}
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: 16,
              }}
            >
              <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 10px 0', color: 'var(--text-primary)' }}>
                Provenance & Coordinate Reference
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 6, fontSize: 12 }}>
                <span style={{ color: 'var(--text-muted)' }}>Schema Version:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{inspectingConfig.provenance.schema_version}</span>

                <span style={{ color: 'var(--text-muted)' }}>Author / Team:</span>
                <span>{inspectingConfig.provenance.author}</span>

                <span style={{ color: 'var(--text-muted)' }}>Site Reference:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{inspectingConfig.provenance.site_reference}</span>

                <span style={{ color: 'var(--text-muted)' }}>Coordinate System:</span>
                <span style={{ fontFamily: 'var(--font-mono)' }}>{inspectingConfig.provenance.coordinate_system}</span>
              </div>
            </div>

            {/* Configured Equipment Inventory */}
            <div>
              <h4 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px 0', color: 'var(--text-primary)' }}>
                Configured Equipment Inventory ({inspectingConfig.sceneModel.equipment.length})
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {inspectingConfig.sceneModel.equipment.map((eq: any) => (
                  <div
                    key={eq.id}
                    style={{
                      background: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: 12,
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>{eq.name}</strong>
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        ID: {eq.id} | Pos: [{eq.position.join(', ')}]
                      </div>
                    </div>
                    <span className="badge badge-info" style={{ fontSize: 10 }}>
                      {eq.category}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Launch Action */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setInspectingConfig(null)}
              >
                Close
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const id = inspectingConfig.id;
                  setInspectingConfig(null);
                  onOpenTwin(id);
                }}
              >
                <Play size={13} />
                <span>Launch This 3D Twin</span>
              </button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
