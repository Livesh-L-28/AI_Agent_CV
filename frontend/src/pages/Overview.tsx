import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  Video,
  AlertTriangle,
  Cpu,
  ArrowRight,
  RefreshCw,
  Camera,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import {
  fetchSummary,
  fetchVisionMetrics,
  fetchEvents,
  fetchIncidents,
  fetchCameras,
  SummaryMetrics,
  VisionMetrics,
  SafetyEvent,
  Incident,
  Camera as CameraType,
} from '../services/api';
import { KpiCard } from '../components/KpiCard';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';

interface OverviewProps {
  onNavigate: (page: string) => void;
}

export const Overview: React.FC<OverviewProps> = ({ onNavigate }) => {
  const [summary, setSummary] = useState<SummaryMetrics | null>(null);
  const [vision, setVision] = useState<VisionMetrics | null>(null);
  const [recentEvents, setRecentEvents] = useState<SafetyEvent[]>([]);
  const [recentIncidents, setRecentIncidents] = useState<Incident[]>([]);
  const [cameras, setCameras] = useState<CameraType[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sumData, visData, evts, incs, cams] = await Promise.all([
        fetchSummary().catch(() => null),
        fetchVisionMetrics().catch(() => null),
        fetchEvents().catch(() => []),
        fetchIncidents().catch(() => []),
        fetchCameras().catch(() => []),
      ]);
      setSummary(sumData);
      setVision(visData);
      setRecentEvents(Array.isArray(evts) ? evts.slice(0, 6) : []);
      setRecentIncidents(Array.isArray(incs) ? incs.slice(0, 6) : []);
      setCameras(Array.isArray(cams) ? cams : []);
    } catch (e) {
      console.error('Failed to load overview data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const liveCameras = cameras.filter((c) => c.status === 'LIVE').length;
  const staleCameras = cameras.filter((c) => c.status === 'STALE' || c.status === 'RECONNECTING').length;
  const disconnectedCameras = cameras.filter((c) => c.status === 'DISCONNECTED' || c.status === 'STOPPED').length;

  const criticalCount = recentIncidents.filter((i) => i.severity === 'CRITICAL').length;
  const highCount = recentIncidents.filter((i) => i.severity === 'HIGH').length;
  const mediumCount = recentIncidents.filter((i) => i.severity === 'MEDIUM' || i.severity === 'WARNING').length;

  return (
    <div>
      {/* KPI Cards Grid */}
      <div className="grid-cards-4">
        <KpiCard
          id="kpi-sources"
          title="Video Sources"
          icon={Video}
          iconColor="var(--accent-cyan)"
          value={summary?.total_sources ?? (cameras.length > 0 ? cameras.length : null)}
          loading={loading}
          unavailableText="No Feeds"
          footer={
            <span style={{ color: 'var(--status-success)', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span className="pulse-dot" style={{ width: 6, height: 6 }} />
              {summary?.active_sources ?? liveCameras} Active Streams
            </span>
          }
        />

        <KpiCard
          id="kpi-events"
          title="Safety Events"
          icon={AlertTriangle}
          iconColor="var(--status-warning)"
          value={summary?.total_events ?? null}
          loading={loading}
          unavailableText="0 Detected"
          footer={
            <span>
              5-frame temporal persistence gate
            </span>
          }
        />

        <KpiCard
          id="kpi-incidents"
          title="Open Incidents"
          icon={ShieldAlert}
          iconColor="var(--status-danger)"
          value={summary?.open_incidents ?? recentIncidents.filter((i) => i.status === 'OPEN').length}
          loading={loading}
          unavailableText="0 Open"
          borderColor="var(--status-danger)"
          footer={
            <span style={{ color: summary?.critical_incidents ? 'var(--status-danger)' : 'var(--text-muted)' }}>
              {summary?.critical_incidents ?? criticalCount} Critical Breaches
            </span>
          }
        />

        <KpiCard
          id="kpi-vision"
          title="Inference Speed"
          icon={Cpu}
          iconColor="var(--accent-indigo)"
          value={vision && vision.effective_fps > 0 ? Number(vision.effective_fps).toFixed(1) : null}
          unit="FPS"
          loading={loading}
          unavailableText="IDLE (Awaiting stream)"
          footer={
            vision && vision.device ? (
              <span>
                HW: <strong>{vision.device.toUpperCase()}</strong> ({vision.average_latency_ms.toFixed(1)}ms)
              </span>
            ) : (
              <span>Edge acceleration standby</span>
            )
          }
        />
      </div>

      {/* Operational Summary Bar: Camera Health & Severity Distribution */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 20,
          marginBottom: 24,
        }}
      >
        {/* Camera Connectivity Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-card)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.6, marginBottom: 4 }}>
              Camera Network Health
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--status-success)' }}>
                <CheckCircle2 size={14} /> {liveCameras} Live
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--status-warning)' }}>
                <Activity size={14} /> {staleCameras} Stale
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--text-muted)' }}>
                <Camera size={14} /> {disconnectedCameras} Disconnected
              </span>
            </div>
          </div>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => onNavigate('monitor')}
          >
            Manage Cameras <ArrowRight size={13} />
          </button>
        </div>

        {/* Severity Breakdown Card */}
        <div
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-card)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600, letterSpacing: 0.6, marginBottom: 4 }}>
              Active Incidents By Severity
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <span className="badge badge-critical">Critical: {criticalCount}</span>
              <span className="badge badge-warning">High: {highCount}</span>
              <span className="badge badge-info">Medium: {mediumCount}</span>
            </div>
          </div>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: '6px 12px' }}
            onClick={() => onNavigate('incidents')}
          >
            Incident Queue <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* Main Grid: Active Incidents & Real-Time Event Feed */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 24 }}>
        {/* Recent Incidents Panel */}
        <div className="table-container">
          <div className="table-header">
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Active Safety Incidents</h3>
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                Prioritized breaches requiring human supervisory acknowledgment
              </p>
            </div>
            <button className="btn btn-secondary" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => onNavigate('incidents')}>
              View All <ArrowRight size={13} />
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Severity</th>
                <th scope="col">Incident Details</th>
                <th scope="col">Status</th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && recentIncidents.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 20 }}>
                    <SkeletonLoader variant="row" count={3} />
                  </td>
                </tr>
              ) : recentIncidents.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 0 }}>
                    <EmptyState
                      title="No Active Incidents"
                      description="Facility safety rules are operating with zero unacknowledged breaches."
                    />
                  </td>
                </tr>
              ) : (
                recentIncidents.map((inc) => (
                  <tr key={inc.id}>
                    <td>
                      <StatusBadge status={inc.severity} size="sm" />
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      <div>{inc.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                        {inc.id}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={inc.status} size="sm" showIcon={false} />
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 10px', fontSize: 11 }}
                        onClick={() => onNavigate('incidents')}
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Real-Time Detection Feed */}
        <div className="table-container">
          <div className="table-header">
            <div>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Detected Safety Events</h3>
              <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', marginTop: 2 }}>
                Live temporal engine candidate stream with confidence scoring
              </p>
            </div>
            <button
              className="btn btn-secondary"
              style={{ padding: '6px 10px' }}
              onClick={loadData}
              title="Refresh Event Telemetry"
              aria-label="Refresh Event Telemetry"
            >
              <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th scope="col">Classification</th>
                <th scope="col">Worker</th>
                <th scope="col">Persistence</th>
                <th scope="col">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {loading && recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 20 }}>
                    <SkeletonLoader variant="row" count={3} />
                  </td>
                </tr>
              ) : recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ padding: 0 }}>
                    <EmptyState
                      title="Awaiting Safety Events"
                      description="No safety candidates generated. Start a camera feed or simulated run to stream events."
                    />
                  </td>
                </tr>
              ) : (
                recentEvents.map((evt) => (
                  <tr key={evt.id}>
                    <td>
                      <StatusBadge status={evt.event_type} size="sm" />
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      #{evt.track_id}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
                      {evt.persistence_count} frames
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', fontWeight: 600, fontSize: 12 }}>
                      {(evt.confidence * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
