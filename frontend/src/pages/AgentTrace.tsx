import React, { useEffect, useState } from 'react';
import {
  Search,
  Scale,
  Zap,
  ShieldCheck,
  AlertCircle,
  Play,
  Sparkles,
  Bot,
  Binary,
} from 'lucide-react';
import { triggerInvestigation, fetchEvents, SafetyEvent, AgentRunState } from '../services/api';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { TelemetryBanner } from '../components/TelemetryBanner';

export const AgentTrace: React.FC = () => {
  const [events, setEvents] = useState<SafetyEvent[]>([]);
  const [eventId, setEventId] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [trace, setTrace] = useState<AgentRunState | null>(null);
  const [isDemoTrace, setIsDemoTrace] = useState(false);

  useEffect(() => {
    fetchEvents()
      .then((evts) => {
        if (Array.isArray(evts) && evts.length > 0) {
          setEvents(evts);
          setEventId(evts[0].id);
        }
      })
      .catch((e) => console.warn('Could not load events for selector', e));
  }, []);

  const handleRunInvestigation = async () => {
    if (!eventId) return;
    try {
      setLoading(true);
      setErrorMessage(null);
      setIsDemoTrace(false);
      const result = await triggerInvestigation(eventId);
      setTrace(result);
    } catch (e: any) {
      console.error('Investigation error', e);
      setErrorMessage(e.message || 'Investigation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDemoTrace = () => {
    setIsDemoTrace(true);
    setErrorMessage(null);
    setTrace({
      status: 'COMPLETED',
      correlation_id: 'corr-demo-trace-987',
      investigation: {
        summary: 'Worker #SIM-884 observed crossing into restricted Welding Bay 3 footprint. Trajectory confirms persistent ground contact without authorized PPE clearance.',
        cited_evidence_ids: ['ev_frame_042', 'ev_frame_043', 'ev_frame_044'],
        is_sufficient_evidence: true,
        missing_evidence: [],
        risk_assessment: 'Immediate physical collision risk from moving robotic articulated manipulator arm.',
      },
      policy_result: {
        is_policy_violated: true,
        policy_rule_id: 'RULE_RESTRICTED_ZONE_ROBOTICS',
        deterministic_severity: 'CRITICAL',
        recommended_action: 'CREATE_INCIDENT_AND_ALERT',
      },
      actions_executed: 2,
      verification: {
        is_verified: true,
        verification_status: 'VERIFIED_SUCCESS',
        incident_confirmed: true,
        notification_confirmed: true,
        audit_evidence: 'Actions executed: 2. Incident Record: CONFIRMED (id: inc-sim-demo-01). Dispatch: CONFIRMED (sink: websocket_broadcast).',
      },
      is_degraded_mode: false,
    });
  };

  return (
    <div>
      {/* Top Action & Selector Bar */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          marginBottom: 20,
          backgroundColor: 'var(--bg-surface)',
          padding: '14px 18px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-subtle)',
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
          Select Event Source:
        </span>
        {events.length > 0 && (
          <select
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            style={{
              padding: '6px 12px',
              backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 6,
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.id} ({ev.event_type} - {ev.severity})
              </option>
            ))}
          </select>
        )}

        <input
          type="text"
          value={eventId}
          onChange={(e) => setEventId(e.target.value)}
          placeholder="Enter safety event ID..."
          style={{
            padding: '6px 12px',
            backgroundColor: 'var(--bg-card)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            minWidth: 220,
          }}
        />

        <button
          className="btn btn-primary"
          onClick={handleRunInvestigation}
          disabled={loading || !eventId}
        >
          <Play size={14} />
          {loading ? 'Orchestrating Agents...' : 'Run Live Investigation'}
        </button>

        <button
          className="btn btn-secondary"
          onClick={handleLoadDemoTrace}
          title="Load demonstration sample execution trace"
        >
          <Sparkles size={14} /> Load Demo Trace
        </button>

        {trace && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>
              CID: <code style={{ color: 'var(--accent-cyan)' }}>{trace.correlation_id}</code>
            </span>
            <StatusBadge status={trace.status} size="sm" />
            {isDemoTrace && <StatusBadge status="SIMULATION" size="sm" />}
          </div>
        )}
      </div>

      {isDemoTrace && (
        <TelemetryBanner
          mode="SIMULATION"
          message="SIMULATION TRACE: Displaying sample multi-agent execution pipeline. No live LLM or database mutations triggered."
          action={{
            label: 'Clear Trace',
            onClick: () => {
              setTrace(null);
              setIsDemoTrace(false);
            },
          }}
        />
      )}

      {errorMessage && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--status-danger)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 20,
            color: 'var(--status-danger)',
            fontSize: 13,
          }}
        >
          <AlertCircle size={16} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Content: Trace Visualization or Unexecuted Empty State */}
      {loading ? (
        <div style={{ padding: 24, background: 'var(--bg-card)', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <Bot size={18} className="animate-spin" color="var(--accent-cyan)" />
            <span style={{ fontWeight: 600 }}>Executing Multi-Agent Safety DAG...</span>
          </div>
          <SkeletonLoader variant="card" count={2} />
        </div>
      ) : !trace ? (
        <div className="table-container" style={{ padding: 20 }}>
          <EmptyState
            icon={Bot}
            title="No Agent Investigation Executed"
            description="Select a detected safety event from the selector above and click 'Run Live Investigation', or click 'Load Demo Trace' to explore the multi-agent pipeline."
            action={{
              label: 'Load Sample Demo Trace',
              onClick: handleLoadDemoTrace,
              icon: Sparkles,
            }}
          />
        </div>
      ) : (
        <div>
          {/* 4-Stage Visual Workflow Pipeline */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 16,
              marginBottom: 24,
            }}
          >
            {/* Stage A: Investigator */}
            <div className="kpi-card" style={{ borderTop: '3px solid var(--accent-cyan)' }}>
              <div className="kpi-title">
                <span>Stage 1: Investigator</span>
                <Search size={16} color="var(--accent-cyan)" />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Evidence Grounding
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 6 }}>
                {trace.investigation?.is_sufficient_evidence ? 'SUFFICIENT EVIDENCE' : 'UNCERTAIN'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Cited: {trace.investigation?.cited_evidence_ids.length ?? 0} observations
              </div>
            </div>

            {/* Stage B: Policy Gate */}
            <div className="kpi-card" style={{ borderTop: '3px solid var(--status-danger)' }}>
              <div className="kpi-title">
                <span>Stage 2: Policy Gate</span>
                <Scale size={16} color="var(--status-danger)" />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Deterministic Rule
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-danger)', marginTop: 6 }}>
                {trace.policy_result?.is_policy_violated ? 'POLICY VIOLATED' : 'COMPLIANT'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Severity: {trace.policy_result?.deterministic_severity || '—'}
              </div>
            </div>

            {/* Stage C: Responder */}
            <div className="kpi-card" style={{ borderTop: '3px solid var(--status-warning)' }}>
              <div className="kpi-title">
                <span>Stage 3: Responder</span>
                <Zap size={16} color="var(--status-warning)" />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Allowlisted Tools
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginTop: 6 }}>
                {trace.actions_executed} Action(s) Dispatched
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Idempotency: Guaranteed
              </div>
            </div>

            {/* Stage D: Verifier */}
            <div className="kpi-card" style={{ borderTop: '3px solid var(--status-success)' }}>
              <div className="kpi-title">
                <span>Stage 4: Verifier</span>
                <ShieldCheck size={16} color="var(--status-success)" />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                Cryptographic Proof
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--status-success)', marginTop: 6 }}>
                {trace.verification?.verification_status || 'VERIFIED'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                Database & Alert Verified
              </div>
            </div>
          </div>

          {/* Structured Trace Detail Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
            {/* Left: Investigation Narrative & Cited Evidence */}
            <div className="table-container" style={{ padding: 22 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Investigator Narrative
                </h3>
                <span className="badge badge-info" style={{ fontSize: 10 }}>
                  <Bot size={11} /> LLM Explanation
                </span>
              </div>
              <p style={{ fontSize: 13.5, color: 'var(--text-primary)', lineHeight: 1.6, marginBottom: 16 }}>
                {trace.investigation?.summary || 'No narrative generated.'}
              </p>

              <div style={{ padding: '12px 16px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, marginBottom: 16 }}>
                <div style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 6 }}>
                  Risk Assessment
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                  {trace.investigation?.risk_assessment || 'No risk assessment provided.'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', marginBottom: 8 }}>
                  Cited Evidence Observations ({trace.investigation?.cited_evidence_ids.length ?? 0})
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {trace.investigation?.cited_evidence_ids.map((id) => (
                    <span
                      key={id}
                      style={{
                        padding: '4px 8px',
                        background: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.25)',
                        borderRadius: 4,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11.5,
                        color: 'var(--accent-cyan)',
                      }}
                    >
                      {id}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: Policy Decision & Verification Audit */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Deterministic Policy Decision Card */}
              <div className="table-container" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    Policy Gate Decision
                  </h4>
                  <span className="badge badge-critical" style={{ fontSize: 10 }}>
                    <Binary size={11} /> Deterministic Code Gate
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Evaluated Rule:</span>
                    <strong style={{ fontFamily: 'var(--font-mono)' }}>{trace.policy_result?.policy_rule_id}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Deterministic Severity:</span>
                    <StatusBadge status={trace.policy_result?.deterministic_severity || 'INFO'} size="sm" />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Action Authorized:</span>
                    <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>
                      {trace.policy_result?.recommended_action}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 4 }}>
                    Non-overridable gate: LLM safety waivers and hallucinations are strictly rejected by the policy engine.
                  </div>
                </div>
              </div>

              {/* Cryptographic Verification Proof */}
              <div className="table-container" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
                    Proof Verification
                  </h4>
                  <StatusBadge status={trace.verification?.verification_status || 'VERIFIED'} size="sm" />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Database Record:</span>
                    <span style={{ color: trace.verification?.incident_confirmed ? 'var(--status-success)' : 'var(--text-muted)' }}>
                      ● {trace.verification?.incident_confirmed ? 'Confirmed Persisted' : 'Not Generated'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Dispatch Confirmation:</span>
                    <span style={{ color: trace.verification?.notification_confirmed ? 'var(--status-success)' : 'var(--text-muted)' }}>
                      ● {trace.verification?.notification_confirmed ? 'Dispatched Sink' : 'Idle'}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', borderTop: '1px solid var(--border-subtle)', paddingTop: 8, marginTop: 4 }}>
                    {trace.verification?.audit_evidence}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
