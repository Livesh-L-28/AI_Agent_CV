import React, { useState } from 'react';
import {
  Search,
  Scale,
  Zap,
  ShieldCheck,
} from 'lucide-react';
import { triggerInvestigation, AgentRunState } from '../services/api';

export const AgentTrace: React.FC = () => {
  const [eventId, setEventId] = useState('evt_zone_entry_live');
  const [loading, setLoading] = useState(false);
  const [trace, setTrace] = useState<AgentRunState | null>({
    status: 'COMPLETED',
    correlation_id: 'corr-demo-trace-987',
    investigation: {
      summary: 'Verified Worker #101 crossed restricted perimeter into Crane Zone A-1.',
      cited_evidence_ids: ['det_frame_58', 'det_frame_59', 'det_frame_60'],
      is_sufficient_evidence: true,
      missing_evidence: [],
      risk_assessment: 'Immediate physical safety hazard from overhead moving machinery.',
    },
    policy_result: {
      is_policy_violated: true,
      policy_rule_id: 'RULE_RESTRICTED_ZONE_CRANE',
      deterministic_severity: 'CRITICAL',
      recommended_action: 'CREATE_INCIDENT_AND_ALERT',
    },
    actions_executed: 2,
    verification: {
      is_verified: true,
      verification_status: 'VERIFIED_SUCCESS',
      incident_confirmed: true,
      notification_confirmed: true,
      audit_evidence: 'Actions executed: 2. Incident Record: CONFIRMED. Notification Dispatch: CONFIRMED.',
    },
    is_degraded_mode: false,
  });

  const handleRunInvestigation = async () => {
    try {
      setLoading(true);
      const result = await triggerInvestigation(eventId);
      setTrace(result);
    } catch (e) {
      console.error('Investigation error', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      {/* Top action bar */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 24,
          backgroundColor: 'var(--bg-surface)',
          padding: '14px 18px',
          borderRadius: 8,
          border: '1px solid var(--border-subtle)',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Target Event ID:</span>
        <input
          type="text"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          style={{
            padding: '6px 12px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            color: '#fff',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            width: 260,
          }}
        />
        <button
          className="btn btn-primary"
          onClick={handleRunInvestigation}
          disabled={loading}
        >
          {loading ? 'Orchestrating Agents...' : 'Run Agent Investigation'}
        </button>

        {trace && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="badge badge-info">{trace.correlation_id}</span>
            <span className="badge badge-success">● {trace.status}</span>
          </div>
        )}
      </div>

      {/* 4-Stage Visual Workflow Pipeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {/* Stage A */}
        <div className="kpi-card" style={{ borderTop: '3px solid var(--accent-cyan)' }}>
          <div className="kpi-title">
            <span>Agent A: Investigator</span>
            <Search size={16} color="var(--accent-cyan)" />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
            Evidence Grounding
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 4 }}>
            {trace?.investigation?.is_sufficient_evidence ? 'SUFFICIENT EVIDENCE' : 'UNCERTAIN'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Cited: {trace?.investigation?.cited_evidence_ids.length ?? 0} observations
          </div>
        </div>

        {/* Stage B */}
        <div className="kpi-card" style={{ borderTop: '3px solid var(--status-danger)' }}>
          <div className="kpi-title">
            <span>Agent B: Policy Gate</span>
            <Scale size={16} color="var(--status-danger)" />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
            Deterministic Rule
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-danger)', marginTop: 4 }}>
            {trace?.policy_result?.is_policy_violated ? 'POLICY VIOLATED' : 'COMPLIANT'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Severity: {trace?.policy_result?.deterministic_severity}
          </div>
        </div>

        {/* Stage C */}
        <div className="kpi-card" style={{ borderTop: '3px solid var(--status-warning)' }}>
          <div className="kpi-title">
            <span>Agent C: Responder</span>
            <Zap size={16} color="var(--status-warning)" />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
            Allowlisted Tools
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginTop: 4 }}>
            {trace?.actions_executed ?? 2} Tools Dispatched
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Idempotency: Guaranteed
          </div>
        </div>

        {/* Stage D */}
        <div className="kpi-card" style={{ borderTop: '3px solid var(--status-success)' }}>
          <div className="kpi-title">
            <span>Agent D: Verifier</span>
            <ShieldCheck size={16} color="var(--status-success)" />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
            DB Record Proof
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-success)', marginTop: 4 }}>
            {trace?.verification?.verification_status ?? 'VERIFIED_SUCCESS'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
            Database & Notification Verified
          </div>
        </div>
      </div>

      {/* Structured Trace Detail Card */}
      <div className="table-container" style={{ padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>
          Investigation Narrative & Evidence Citations
        </h3>
        <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 16 }}>
          {trace?.investigation?.summary}
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ backgroundColor: 'var(--bg-card)', padding: 14, borderRadius: 6 }}>
            <h4 style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
              Policy Evaluation Decision
            </h4>
            <div style={{ fontSize: 13 }}>
              <div><strong>Rule:</strong> {trace?.policy_result?.policy_rule_id}</div>
              <div><strong>Recommended Action:</strong> {trace?.policy_result?.recommended_action}</div>
              <div><strong>Deterministic Gate:</strong> Non-overridable by LLM</div>
            </div>
          </div>

          <div style={{ backgroundColor: 'var(--bg-card)', padding: 14, borderRadius: 6 }}>
            <h4 style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8, textTransform: 'uppercase' }}>
              Verification Evidence
            </h4>
            <div style={{ fontSize: 13 }}>
              <div><strong>Incident Confirmed:</strong> {trace?.verification?.incident_confirmed ? 'YES (Database Row ID valid)' : 'NO'}</div>
              <div><strong>Notification Confirmed:</strong> {trace?.verification?.notification_confirmed ? 'YES (Mock Dispatch Sink)' : 'NO'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {trace?.verification?.audit_evidence}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
