/**
 * SENTINEL AI API & WebSocket Client Service
 */

export interface HealthInfo {
  status: string;
  database_connected: boolean;
  environment: string;
  timestamp: string;
}

export interface SummaryMetrics {
  total_sources: number;
  active_sources: number;
  total_events: number;
  total_incidents: number;
  open_incidents: number;
  critical_incidents: number;
}

export interface VisionMetrics {
  device: string;
  average_latency_ms: number;
  effective_fps: number;
  frames_processed: number;
  detected_persons: number;
}

export interface VideoSource {
  id: string;
  name: string;
  source_type: string;
  uri: string;
  status: string;
  fps: number;
  created_at: string;
}

export interface SafetyEvent {
  id: string;
  source_id: string;
  track_id: number;
  event_type: string;
  severity: string;
  zone_id?: string;
  rule_id: string;
  first_observation_ns: number;
  last_observation_ns: number;
  persistence_count: number;
  confidence: number;
  deduplication_key: string;
  meta_json: Record<string, any>;
  created_at: string;
}

export interface Incident {
  id: string;
  event_id: string;
  title: string;
  status: string;
  severity: string;
  assigned_to?: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentRunState {
  status: string;
  correlation_id: string;
  investigation: {
    summary: string;
    cited_evidence_ids: string[];
    is_sufficient_evidence: boolean;
    missing_evidence: string[];
    risk_assessment: string;
  } | null;
  policy_result: {
    is_policy_violated: boolean;
    policy_rule_id: string;
    deterministic_severity: string;
    recommended_action: string;
    rejection_reason?: string;
  } | null;
  actions_executed: number;
  verification: {
    is_verified: boolean;
    verification_status: string;
    incident_confirmed: boolean;
    notification_confirmed: boolean;
    audit_evidence: string;
  } | null;
  is_degraded_mode: boolean;
}

const BASE_URL = '';

export async function fetchHealth(): Promise<HealthInfo> {
  const res = await fetch(`${BASE_URL}/health/ready`);
  return res.json();
}

export async function fetchSummary(): Promise<SummaryMetrics> {
  const res = await fetch(`${BASE_URL}/api/v1/analytics/summary`);
  return res.json();
}

export async function fetchVisionMetrics(): Promise<VisionMetrics> {
  const res = await fetch(`${BASE_URL}/api/v1/analytics/vision`);
  return res.json();
}

export async function fetchSources(): Promise<VideoSource[]> {
  const res = await fetch(`${BASE_URL}/api/v1/sources`);
  return res.json();
}

export async function startSource(id: string): Promise<VideoSource> {
  const res = await fetch(`${BASE_URL}/api/v1/sources/${id}/start`, { method: 'POST' });
  return res.json();
}

export async function stopSource(id: string): Promise<VideoSource> {
  const res = await fetch(`${BASE_URL}/api/v1/sources/${id}/stop`, { method: 'POST' });
  return res.json();
}

export async function fetchEvents(): Promise<SafetyEvent[]> {
  const res = await fetch(`${BASE_URL}/api/v1/events?limit=50`);
  return res.json();
}

export async function fetchIncidents(): Promise<Incident[]> {
  const res = await fetch(`${BASE_URL}/api/v1/incidents?limit=50`);
  return res.json();
}

export async function fetchIncident(id: string): Promise<Incident> {
  const res = await fetch(`${BASE_URL}/api/v1/incidents/${id}`);
  return res.json();
}

export async function reviewIncident(
  id: string,
  action: 'RESOLVE' | 'DISMISS' | 'ESCALATE',
  reviewerName: string,
  notes?: string
): Promise<Incident> {
  const res = await fetch(`${BASE_URL}/api/v1/incidents/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reviewer_name: reviewerName, notes }),
  });
  return res.json();
}

export async function triggerInvestigation(eventId: string): Promise<AgentRunState> {
  const res = await fetch(`${BASE_URL}/api/v1/agents/investigate/${eventId}`, {
    method: 'POST',
  });
  return res.json();
}

export function createStreamConnection(
  onMessage: (data: any) => void,
  onError?: (err: any) => void
): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/v1/stream`;
  const ws = new WebSocket(wsUrl);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch {
      onMessage(event.data);
    }
  };

  if (onError) {
    ws.onerror = onError;
  }

  return ws;
}
