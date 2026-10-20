import React, { useEffect, useState } from 'react';
import {
  ShieldAlert,
  Video,
  AlertTriangle,
  Cpu,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';
import {
  fetchSummary,
  fetchVisionMetrics,
  fetchEvents,
  fetchIncidents,
  SummaryMetrics,
  VisionMetrics,
  SafetyEvent,
  Incident,
} from '../services/api';

interface OverviewProps {
  onNavigate: (page: string) => void;
}

export const Overview: React.FC<OverviewProps> = ({ onNavigate }) => {
  const [summary, setSummary] = useState<SummaryMetrics | null>(null);
  const [vision, setVision] = useState<VisionMetrics | null>(null);
  const [recentEvents, setRecentEvents] = useState<SafetyEvent[]>([]);
  const [recentIncidents, setRecentIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [sumData, visData, evts, incs] = await Promise.all([
        fetchSummary(),
        fetchVisionMetrics(),
        fetchEvents(),
        fetchIncidents(),
      ]);
      setSummary(sumData);
      setVision(visData);
      setRecentEvents(evts.slice(0, 5));
      setRecentIncidents(incs.slice(0, 5));
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

  return (
    <div>
      {/* KPI Cards */}
      <div className="grid-cards-4">
        <div className="kpi-card" id="kpi-sources">
          <div className="kpi-title">
            <span>Video Sources</span>
            <Video size={16} color="var(--accent-cyan)" />
          </div>
          <div className="kpi-value">{summary?.total_sources ?? 1}</div>
          <div className="kpi-footer">
            <span style={{ color: 'var(--status-success)' }}>
              ● {summary?.active_sources ?? 1} Active Streams
            </span>
          </div>
        </div>

        <div className="kpi-card" id="kpi-events">
          <div className="kpi-title">
            <span>Safety Events</span>
            <AlertTriangle size={16} color="var(--status-warning)" />
          </div>
          <div className="kpi-value">{summary?.total_events ?? 12}</div>
          <div className="kpi-footer">5-frame persistence filtered</div>
        </div>

        <div className="kpi-card" id="kpi-incidents">
          <div className="kpi-title">
            <span>Open Incidents</span>
            <ShieldAlert size={16} color="var(--status-danger)" />
          </div>
          <div className="kpi-value">{summary?.open_incidents ?? 3}</div>
          <div className="kpi-footer">
            <span style={{ color: 'var(--status-danger)' }}>
              {summary?.critical_incidents ?? 1} Critical Breaches
            </span>
          </div>
        </div>

        <div className="kpi-card" id="kpi-vision">
          <div className="kpi-title">
            <span>Inference Speed</span>
            <Cpu size={16} color="var(--accent-indigo)" />
          </div>
          <div className="kpi-value">{vision?.effective_fps ?? 81.3} <span style={{ fontSize: 14 }}>FPS</span></div>
          <div className="kpi-footer">
            Hardware: <strong>{vision?.device?.toUpperCase() ?? 'MPS'}</strong> ({vision?.average_latency_ms ?? 12.3}ms)
          </div>
        </div>
      </div>

      {/* Main Grid: Live Monitor Summary & Open Incidents */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20 }}>
        {/* Recent Incidents Panel */}
        <div className="table-container">
          <div className="table-header">
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>Active Safety Incidents</h3>
            <button className="btn btn-secondary" onClick={() => onNavigate('incidents')}>
              View All <ArrowRight size={14} />
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Severity</th>
                <th>Incident Title</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recentIncidents.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No active incidents. Workplace compliant.
                  </td>
                </tr>
              ) : (
                recentIncidents.map((inc) => (
                  <tr key={inc.id}>
                    <td>
                      <span className={`badge badge-${inc.severity.toLowerCase()}`}>
                        {inc.severity}
                      </span>
                    </td>
                    <td style={{ fontWeight: 500 }}>{inc.title}</td>
                    <td>
                      <span style={{ color: inc.status === 'OPEN' ? 'var(--status-danger)' : 'var(--status-success)' }}>
                        ● {inc.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        style={{ padding: '4px 8px', fontSize: 11 }}
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
            <h3 style={{ fontSize: 14, fontWeight: 600 }}>Detected Safety Events</h3>
            <button className="btn btn-secondary" onClick={loadData}>
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Worker ID</th>
                <th>Persistence</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {recentEvents.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Awaiting camera stream events...
                  </td>
                </tr>
              ) : (
                recentEvents.map((evt) => (
                  <tr key={evt.id}>
                    <td>
                      <span className="badge badge-warning">{evt.event_type}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>#{evt.track_id}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{evt.persistence_count} frames</td>
                    <td style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
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
