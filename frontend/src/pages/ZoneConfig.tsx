import React, { useEffect, useState, useMemo } from 'react';
import {
  ShieldAlert,
  Sliders,
  Edit2,
  Camera,
  Layers,
  Lock,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import {
  fetchFactoryScene,
  updateFactoryScene,
  FactorySceneModel,
  SpatialSafetyZone,
} from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { FilterBar } from '../components/FilterBar';
import { KpiCard } from '../components/KpiCard';
import { Drawer } from '../components/Drawer';
import { Modal } from '../components/Modal';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { EmptyState } from '../components/EmptyState';

export const ZoneConfig: React.FC = () => {
  const [scene, setScene] = useState<FactorySceneModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('ALL');

  // Edit Drawer & Confirmation Modal state
  const [selectedZone, setSelectedZone] = useState<SpatialSafetyZone | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<'RESTRICTED' | 'WARNING' | 'SAFE'>('RESTRICTED');
  const [editRules, setEditRules] = useState<string[]>([]);
  const [editPersistence, setEditPersistence] = useState(5);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const loadScene = () => {
    setLoading(true);
    setError(null);
    fetchFactoryScene()
      .then((data) => {
        setScene(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load factory spatial scene');
        setLoading(false);
      });
  };

  useEffect(() => {
    loadScene();
  }, []);

  const zones = useMemo(() => scene?.zones || [], [scene]);

  // Filter tabs
  const filterTabs = useMemo(() => {
    const total = zones.length;
    const restricted = zones.filter((z) => z.zone_type === 'RESTRICTED').length;
    const warning = zones.filter((z) => z.zone_type === 'WARNING').length;
    const safe = zones.filter((z) => z.zone_type === 'SAFE').length;

    return [
      { id: 'ALL', label: 'All Spatial Zones', count: total },
      { id: 'RESTRICTED', label: 'Restricted (Danger)', count: restricted },
      { id: 'WARNING', label: 'Warning Buffers', count: warning },
      { id: 'SAFE', label: 'Safe Walkways', count: safe },
    ];
  }, [zones]);

  const filteredZones = useMemo(() => {
    return zones.filter((zone) => {
      const matchesSearch =
        zone.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        zone.zone_id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = activeFilter === 'ALL' || zone.zone_type === activeFilter;
      return matchesSearch && matchesFilter;
    });
  }, [zones, searchQuery, activeFilter]);

  const openEditDrawer = (zone: SpatialSafetyZone) => {
    setSelectedZone(zone);
    setEditName(zone.name);
    setEditType(zone.zone_type);
    setEditRules([...zone.active_rules]);
    setEditPersistence(5); // Default deterministic 5-frame persistence gate
    setIsDrawerOpen(true);
  };

  const handleRuleToggle = (rule: string) => {
    if (editRules.includes(rule)) {
      setEditRules(editRules.filter((r) => r !== rule));
    } else {
      setEditRules([...editRules, rule]);
    }
  };

  const handleOpenConfirmation = () => {
    setIsConfirmModalOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!scene || !selectedZone) return;
    setIsSaving(true);
    setSaveSuccessMessage(null);

    const updatedZones = scene.zones.map((z) => {
      if (z.zone_id === selectedZone.zone_id) {
        return {
          ...z,
          name: editName,
          zone_type: editType,
          color_hex: editType === 'RESTRICTED' ? '#EF4444' : editType === 'WARNING' ? '#F59E0B' : '#10B981',
          active_rules: editRules,
        };
      }
      return z;
    });

    const updatedScene: FactorySceneModel = {
      ...scene,
      zones: updatedZones,
      updated_at: new Date().toISOString(),
      updated_by: 'safety_officer',
    };

    try {
      const persisted = await updateFactoryScene(updatedScene);
      setScene(persisted);
      setIsConfirmModalOpen(false);
      setIsDrawerOpen(false);
      setSaveSuccessMessage(`Successfully updated safety policy for "${selectedZone.zone_id}".`);
      setTimeout(() => setSaveSuccessMessage(null), 6000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to persist zone policy';
      alert(`Error updating policy: ${msg}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Page Header */}
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
              Zone Safety Policies & Spatial Rule Engine
            </h2>
            <StatusBadge status="ACTIVE" label="AUTHORITATIVE 3D CONFIGURATION" />
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
            Configure spatial containment polygons, PPE requirements, camera homography mapping, and temporal persistence gates.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={loadScene}
            disabled={loading}
            aria-label="Reload factory scene policies"
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            <span>Reload</span>
          </button>
        </div>
      </div>

      {saveSuccessMessage && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.1)',
            border: '1px solid var(--status-success)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            color: 'var(--status-success)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
          }}
          role="status"
        >
          <CheckCircle2 size={16} />
          <span>{saveSuccessMessage}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <KpiCard
          title="Configured Safety Zones"
          value={loading ? null : zones.length}
          subtitle={`Across ${scene?.dimensions.width_meters || 60}m x ${scene?.dimensions.depth_meters || 40}m facility`}
          loading={loading}
          borderColor="var(--accent-cyan)"
        />
        <KpiCard
          title="Restricted Danger Zones"
          value={loading ? null : zones.filter((z) => z.zone_type === 'RESTRICTED').length}
          subtitle="Mandatory zero-unauthorized-access zones"
          loading={loading}
          borderColor="var(--status-danger)"
        />
        <KpiCard
          title="Temporal Persistence Gate"
          value="5 Frames"
          subtitle="~160ms filter eliminates boundary noise"
          borderColor="var(--status-success)"
        />
        <KpiCard
          title="Camera Homography Status"
          value={loading ? null : `${scene?.cameras.filter((c) => c.calibrated).length || 0} / ${scene?.cameras.length || 0}`}
          subtitle="Calibrated metric floor coordinate projections"
          loading={loading}
          borderColor="var(--border-color)"
        />
      </div>

      {/* Search & Filter Bar */}
      <FilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search safety zones by name or ID…"
        filterOptions={filterTabs}
        activeFilter={activeFilter}
        onFilterChange={setActiveFilter}
      />

      {/* Main Zones Table */}
      <div className="table-container">
        <div className="table-header">
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Spatial Safety Boundaries</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Authoritative coordinate definitions persisted in factory scene fixture
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Updated:</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>
              {scene?.updated_at ? new Date(scene.updated_at).toLocaleString() : 'System default'}
            </span>
            <span className="badge badge-info" style={{ fontSize: 10 }}>
              BY: {scene?.updated_by || 'system'}
            </span>
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 20 }}>
            <SkeletonLoader variant="row" count={4} />
          </div>
        ) : error ? (
          <EmptyState
            title="Failed to Load Zone Policies"
            description={error}
            action={{ label: 'Retry Loading', onClick: loadScene }}
          />
        ) : filteredZones.length === 0 ? (
          <EmptyState
            title="No Matching Zones Found"
            description={searchQuery ? `No safety zones match "${searchQuery}".` : 'No safety zones are configured.'}
            action={searchQuery ? { label: 'Clear Filter', onClick: () => { setSearchQuery(''); setActiveFilter('ALL'); } } : undefined}
          />
        ) : (
          <table>
            <thead>
              <tr>
                <th>Zone ID & Name</th>
                <th>Classification</th>
                <th>Enforced Safety Rules</th>
                <th>Persistence Gate</th>
                <th>Boundary Polygon (Metric [X, Z])</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredZones.map((z) => {
                const isRestricted = z.zone_type === 'RESTRICTED';
                const isWarning = z.zone_type === 'WARNING';
                const statusType = isRestricted ? 'CRITICAL' : isWarning ? 'HIGH' : 'SAFE';

                return (
                  <tr key={z.zone_id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: '50%',
                            background: z.color_hex || (isRestricted ? '#EF4444' : isWarning ? '#F59E0B' : '#10B981'),
                            flexShrink: 0,
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{z.name}</div>
                          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                            {z.zone_id}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td>
                      <StatusBadge status={statusType} label={z.zone_type} />
                    </td>

                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {z.active_rules.length > 0 ? (
                          z.active_rules.map((rule) => (
                            <span
                              key={rule}
                              className={`badge ${
                                rule === 'NO_ENTRY'
                                  ? 'badge-critical'
                                  : rule === 'PPE_REQUIRED'
                                  ? 'badge-warning'
                                  : 'badge-info'
                              }`}
                              style={{ fontSize: 10 }}
                            >
                              {rule}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Safe Walkway (No Restrictions)</span>
                        )}
                      </div>
                    </td>

                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>5 Frames</span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>(~160ms)</span>
                      </div>
                    </td>

                    <td>
                      <div
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 11,
                          color: 'var(--accent-cyan)',
                          maxWidth: 320,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={JSON.stringify(z.polygon_meters)}
                      >
                        {z.polygon_meters.map((pt) => `[${pt[0]}, ${pt[1]}]`).join(' → ')}
                      </div>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 12 }}
                        onClick={() => openEditDrawer(z)}
                        aria-label={`Configure policy for ${z.name}`}
                      >
                        <Edit2 size={12} />
                        <span>Configure</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Associated Cameras & Homography Calibration Overview */}
      <div className="table-container">
        <div className="table-header">
          <div>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>Surveillance Camera Spatial Alignment & Homography</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Camera perspective-to-floor coordinate transformation matrices
            </span>
          </div>
          <span className="badge badge-info">2D to 3D Calibration Engine</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Camera ID & Label</th>
              <th>Operational Status</th>
              <th>Mount Elevation</th>
              <th>Horizontal FOV</th>
              <th>Homography Calibration</th>
              <th>Coverage Polygon</th>
            </tr>
          </thead>
          <tbody>
            {(scene?.cameras || []).map((cam) => (
              <tr key={cam.camera_id}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Camera size={14} color="var(--accent-cyan)" />
                    <div>
                      <strong style={{ color: 'var(--text-primary)' }}>{cam.name}</strong>
                      <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                        {cam.camera_id}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  <StatusBadge status={cam.status === 'ONLINE' ? 'LIVE' : cam.status} label={cam.status} />
                </td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{cam.height_meters}m</td>
                <td style={{ fontFamily: 'var(--font-mono)' }}>{cam.fov_horizontal_deg}&deg;</td>
                <td>
                  {cam.calibrated ? (
                    <StatusBadge status="SAFE" label="CALIBRATED (3x3 Matrix)" />
                  ) : (
                    <StatusBadge status="WARNING" label="UNCALIBRATED" />
                  )}
                </td>
                <td style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>
                  {cam.coverage_polygon_meters.length > 0
                    ? `${cam.coverage_polygon_meters.length} floor points mapped`
                    : 'Auto-calculated from FOV'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Policy Configuration Slide-Out Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={`Configure Safety Policy — ${selectedZone?.zone_id}`}
        width={480}
      >
        {selectedZone && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* RBAC Notice */}
            <div
              style={{
                background: 'rgba(56, 189, 248, 0.08)',
                border: '1px solid var(--accent-cyan)',
                borderRadius: 'var(--radius-md)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                fontSize: 12,
                color: 'var(--accent-cyan)',
              }}
            >
              <Lock size={15} />
              <span>
                <strong>Authorization Enforced:</strong> Persisting zone rule alterations requires <code>SAFETY_OFFICER</code> or <code>ADMIN</code> privileges.
              </span>
            </div>

            {/* Zone Name Field */}
            <div>
              <label htmlFor="edit-zone-name" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Zone Display Name
              </label>
              <input
                id="edit-zone-name"
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                }}
              />
            </div>

            {/* Classification Radio / Select */}
            <div>
              <label htmlFor="edit-zone-classification" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Zone Safety Classification
              </label>
              <select
                id="edit-zone-classification"
                value={editType}
                onChange={(e) => setEditType(e.target.value as 'RESTRICTED' | 'WARNING' | 'SAFE')}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                }}
              >
                <option value="RESTRICTED">RESTRICTED (Critical Danger — Zero Unauthorized Personnel)</option>
                <option value="WARNING">WARNING (High Risk Buffer Zone — Mandatory PPE Required)</option>
                <option value="SAFE">SAFE (Pedestrian Walkway — Standard Facility Access)</option>
              </select>
            </div>

            {/* Rule Checkboxes */}
            <div>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 8 }}>
                Enforced Operational Rules
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editRules.includes('NO_ENTRY')}
                    onChange={() => handleRuleToggle('NO_ENTRY')}
                  />
                  <span>
                    <strong>NO_ENTRY:</strong> Immediate critical safety breach if any worker breaches polygon.
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editRules.includes('PPE_REQUIRED')}
                    onChange={() => handleRuleToggle('PPE_REQUIRED')}
                  />
                  <span>
                    <strong>PPE_REQUIRED:</strong> Mandatory hardhat and high-visibility vest within boundary.
                  </span>
                </label>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editRules.includes('FORKLIFT_EXCLUSION')}
                    onChange={() => handleRuleToggle('FORKLIFT_EXCLUSION')}
                  />
                  <span>
                    <strong>FORKLIFT_EXCLUSION:</strong> Heavy machinery prohibited from entering polygon.
                  </span>
                </label>
              </div>
            </div>

            {/* Persistence Gate */}
            <div>
              <label htmlFor="edit-persistence-slider" style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>
                Temporal Persistence Threshold: <strong>{editPersistence} Frames (~160ms)</strong>
              </label>
              <input
                id="edit-persistence-slider"
                type="range"
                min="1"
                max="15"
                value={editPersistence}
                onChange={(e) => setEditPersistence(Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
                Workers must remain inside or outside polygon for {editPersistence} consecutive frames to trigger an event state transition. Prevents noisy edge oscillation.
              </p>
            </div>

            {/* Metric Polygon Geometry Info */}
            <div
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <Layers size={14} color="var(--accent-cyan)" />
                <span style={{ fontSize: 12, fontWeight: 600 }}>Metric Floor Boundary [X, Z]</span>
              </div>
              <pre
                style={{
                  margin: 0,
                  fontSize: 11,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-secondary)',
                  overflowX: 'auto',
                }}
              >
                {JSON.stringify(selectedZone.polygon_meters, null, 2)}
              </pre>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0 0' }}>
                Floor boundary vertices are edited via Digital Twin interactive handles to preserve metric spatial precision.
              </p>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIsDrawerOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleOpenConfirmation}
              >
                <Sliders size={14} />
                <span>Review & Apply Changes</span>
              </button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Consequential Change Confirmation Modal */}
      <Modal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        title="Confirm Consequential Safety Policy Modification"
        maxWidth={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--status-danger)',
              borderRadius: 'var(--radius-md)',
              padding: 14,
              display: 'flex',
              gap: 12,
            }}
          >
            <ShieldAlert size={20} color="var(--status-danger)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 13, lineHeight: 1.5 }}>
              <strong style={{ color: 'var(--status-danger)' }}>
                Warning: Live Industrial Safety Engine Impact
              </strong>
              <div style={{ color: 'var(--text-secondary)', marginTop: 4 }}>
                Modifying this spatial safety policy directly alters live computer-vision boundary containment calculations and active incident alert dispatches for zone{' '}
                <strong style={{ color: 'var(--text-primary)' }}>{selectedZone?.zone_id}</strong>.
              </div>
            </div>
          </div>

          <div style={{ background: 'var(--bg-surface)', padding: 12, borderRadius: 'var(--radius-md)', fontSize: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 6 }}>
              <span style={{ color: 'var(--text-muted)' }}>Zone Name:</span>
              <strong>{editName}</strong>

              <span style={{ color: 'var(--text-muted)' }}>Classification:</span>
              <StatusBadge status={editType === 'RESTRICTED' ? 'CRITICAL' : editType === 'WARNING' ? 'HIGH' : 'SAFE'} label={editType} />

              <span style={{ color: 'var(--text-muted)' }}>Active Rules:</span>
              <span>{editRules.join(', ') || 'None (Safe)'}</span>

              <span style={{ color: 'var(--text-muted)' }}>Persistence:</span>
              <span>{editPersistence} frames (~160ms)</span>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setIsConfirmModalOpen(false)}
              disabled={isSaving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              style={{ background: 'var(--status-danger)', borderColor: 'var(--status-danger)' }}
              onClick={handleConfirmSave}
              disabled={isSaving}
            >
              {isSaving ? 'Persisting Policy…' : 'Authorize & Persist Policy'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
