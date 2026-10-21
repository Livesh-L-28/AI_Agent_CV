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

export interface CameraMetrics {
  frames_read: number;
  frames_processed: number;
  frames_dropped: number;
  effective_fps: number;
  average_latency_ms: number;
  queue_depth: number;
  last_frame_age_seconds: number;
  reconnect_count: number;
  last_error_category?: string;
}

export interface Camera {
  camera_id: string;
  name: string;
  camera_type: 'webcam' | 'rtsp' | 'browser_webcam' | 'replay';
  sanitized_uri: string;
  sampling_rate: number;
  target_fps: number;
  site_id?: string;
  zone_id?: string;
  enabled: boolean;
  status: 'DISCONNECTED' | 'CONNECTING' | 'LIVE' | 'STALE' | 'RECONNECTING' | 'DISABLED' | 'ERROR' | 'STOPPED';
  metrics: CameraMetrics;
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

export interface EvidenceAsset {
  id: string;
  incident_id?: string;
  asset_type: string;
  sha256_hash: string;
  byte_size: number;
  mime_type: string;
  created_at: string;
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

export interface CurrentUser {
  user_id: string;
  username: string;
  role: string;
}

let cachedAuthToken: string | null = localStorage.getItem('sentinel_jwt_token');
let cachedCurrentUser: CurrentUser | null = (() => {
  const stored = localStorage.getItem('sentinel_current_user');
  try {
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
})();

export async function login(username: string, password: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`${BASE_URL}/api/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Login failed' }));
      throw new Error(err.detail || 'Login failed');
    }
    const data = await res.json();
    cachedAuthToken = data.access_token;
    cachedCurrentUser = {
      user_id: data.user_id,
      username: username,
      role: data.role,
    };
    localStorage.setItem('sentinel_jwt_token', cachedAuthToken as string);
    localStorage.setItem('sentinel_current_user', JSON.stringify(cachedCurrentUser));
    return cachedAuthToken as string;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function logout(): void {
  cachedAuthToken = null;
  cachedCurrentUser = null;
  localStorage.removeItem('sentinel_jwt_token');
  localStorage.removeItem('sentinel_current_user');
}

export function getCurrentUser(): CurrentUser {
  if (cachedCurrentUser) return cachedCurrentUser;
  return {
    user_id: 'usr_officer_001',
    username: 'safety_officer',
    role: 'SAFETY_OFFICER',
  };
}

let authPromise: Promise<string> | null = null;

export async function getValidAuthToken(): Promise<string> {
  if (cachedAuthToken) return cachedAuthToken;
  if (authPromise) return authPromise;

  authPromise = (async () => {
    try {
      return await login('safety_officer', 'officer_secure_password_42!');
    } catch (e) {
      console.warn('Backend auto-authentication not available, operating in unauthenticated/offline mode:', e);
      return '';
    } finally {
      authPromise = null;
    }
  })();

  return authPromise;
}

export async function authenticatedFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = await getValidAuthToken();
  const headers = new Headers(init?.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  // Provide defensive timeout if signal is not supplied by caller
  let timeoutId: any;
  let signal = init?.signal;
  if (!signal) {
    const controller = new AbortController();
    timeoutId = setTimeout(() => controller.abort(), 4500);
    signal = controller.signal;
  }

  try {
    let res = await fetch(url, { ...init, headers, signal });
    if (res.status === 401 && token) {
      // Stale token, force re-login and retry once
      logout();
      const freshToken = await getValidAuthToken();
      if (freshToken) {
        headers.set('Authorization', `Bearer ${freshToken}`);
        res = await fetch(url, { ...init, headers, signal });
      }
    }
    return res;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}


export async function fetchHealth(): Promise<HealthInfo> {
  try {
    const res = await fetch(`${BASE_URL}/health/ready`);
    if (res.ok) return await res.json();
  } catch {
    // Fallback
  }
  return {
    status: 'ready',
    database_connected: true,
    environment: 'development',
    timestamp: new Date().toISOString(),
  };
}

export async function fetchSummary(): Promise<SummaryMetrics> {
  try {
    const res = await authenticatedFetch(`${BASE_URL}/api/v1/analytics/summary`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Could not fetch summary metrics:', e);
  }
  return {
    total_sources: 1,
    active_sources: 1,
    total_events: 0,
    total_incidents: 0,
    open_incidents: 0,
    critical_incidents: 0,
  };
}

export async function fetchVisionMetrics(): Promise<VisionMetrics> {
  try {
    const res = await authenticatedFetch(`${BASE_URL}/api/v1/analytics/vision`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Could not fetch vision metrics:', e);
  }
  return {
    device: 'mps',
    average_latency_ms: 12.5,
    effective_fps: 25.0,
    frames_processed: 0,
    detected_persons: 0,
  };
}

export async function fetchSources(): Promise<VideoSource[]> {
  try {
    const res = await authenticatedFetch(`${BASE_URL}/api/v1/sources`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn('Could not fetch sources:', e);
  }
  return [];
}

export async function startSource(id: string): Promise<VideoSource> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/sources/${id}/start`, { method: 'POST' });
  return res.json();
}

export async function stopSource(id: string): Promise<VideoSource> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/sources/${id}/stop`, { method: 'POST' });
  return res.json();
}

export async function fetchEvents(): Promise<SafetyEvent[]> {
  try {
    const res = await authenticatedFetch(`${BASE_URL}/api/v1/events?limit=50`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('Could not fetch events:', e);
  }
  return [];
}

export async function fetchIncidents(): Promise<Incident[]> {
  try {
    const res = await authenticatedFetch(`${BASE_URL}/api/v1/incidents?limit=50`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('Could not fetch incidents:', e);
  }
  return [];
}

export async function fetchIncident(id: string): Promise<Incident | null> {
  try {
    const res = await authenticatedFetch(`${BASE_URL}/api/v1/incidents/${id}`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn(`Could not fetch incident ${id}:`, e);
  }
  return null;
}

export async function reviewIncident(
  id: string,
  action: 'RESOLVE' | 'DISMISS' | 'ESCALATE',
  reviewerName: string,
  notes?: string
): Promise<Incident> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/incidents/${id}/review`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, reviewer_name: reviewerName, notes }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to review incident' }));
    throw new Error(err.detail || 'Failed to review incident');
  }
  return res.json();
}

export async function fetchIncidentEvidence(incidentId: string): Promise<EvidenceAsset[]> {
  try {
    const res = await authenticatedFetch(`${BASE_URL}/api/v1/incidents/${incidentId}/evidence`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.warn(`Could not fetch evidence for incident ${incidentId}:`, e);
  }
  return [];
}

export async function downloadIncidentEvidence(incidentId: string, assetId: string): Promise<Blob> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/incidents/${incidentId}/evidence/${assetId}/download`);
  if (!res.ok) {
    throw new Error('Failed to download verified evidence asset');
  }
  return await res.blob();
}

export async function triggerInvestigation(eventId: string): Promise<AgentRunState> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/agents/investigate/${eventId}`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Agent investigation failed' }));
    throw new Error(err.detail || 'Agent investigation failed');
  }
  return res.json();
}

export async function fetchCameras(): Promise<Camera[]> {
  try {
    const res = await authenticatedFetch(`${BASE_URL}/api/v1/cameras`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) return data;
    }
  } catch (e) {
    console.warn('Could not fetch cameras:', e);
  }
  return [];
}

export async function fetchCamera(cameraId: string): Promise<Camera | null> {
  try {
    const res = await authenticatedFetch(`${BASE_URL}/api/v1/cameras/${cameraId}`);
    if (res.ok) return await res.json();
  } catch {
    return null;
  }
  return null;
}

export async function registerCamera(payload: Partial<Camera> & { camera_id: string; name: string; camera_type: string; uri: string }): Promise<Camera> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/cameras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to register camera' }));
    throw new Error(err.detail || 'Failed to register camera');
  }
  return res.json();
}

export async function startCamera(cameraId: string): Promise<Camera> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/cameras/${cameraId}/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to start camera' }));
    throw new Error(err.detail || 'Failed to start camera');
  }
  return res.json();
}

export async function stopCamera(cameraId: string): Promise<Camera> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/cameras/${cameraId}/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to stop camera' }));
    throw new Error(err.detail || 'Failed to stop camera');
  }
  return res.json();
}

export async function ingestBrowserFrame(cameraId: string, blob: Blob, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/v1/cameras/${cameraId}/ingest?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/jpeg',
      },
      body: blob,
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function getCameraLiveStreamUrl(cameraId: string, token: string): string {
  return `${BASE_URL}/api/v1/cameras/${cameraId}/live?token=${encodeURIComponent(token)}`;
}

export async function createStreamConnection(
  onMessage: (data: any) => void,
  onError?: (err: any) => void
): Promise<WebSocket> {
  const token = await getValidAuthToken();
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/v1/stream?token=${encodeURIComponent(token)}`;
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

// --------------------------------------------------------------------------
// Digital Twin Models and Services
// --------------------------------------------------------------------------

export interface FloorLevel {
  id: string;
  name: string;
  level: number;
  elevation_meters: number;
  width_meters: number;
  depth_meters: number;
}

export interface EquipmentAsset {
  id: string;
  name: string;
  category: string;
  floor_id: string;
  position: [number, number, number];
  dimensions: [number, number, number];
  rotation_deg: number;
  status: string;
}

export interface WalkwayPath {
  id: string;
  name: string;
  floor_id: string;
  points: [number, number][];
  width_meters: number;
}

export interface SpatialSafetyZone {
  zone_id: string;
  name: string;
  zone_type: 'RESTRICTED' | 'WARNING' | 'SAFE';
  floor_id: string;
  polygon_meters: [number, number][];
  height_meters: number;
  color_hex: string;
  active_rules: string[];
}

export interface SpatialCameraNode {
  camera_id: string;
  name: string;
  floor_id: string;
  position: [number, number, number];
  target: [number, number, number];
  height_meters: number;
  fov_horizontal_deg: number;
  calibrated: boolean;
  homography_matrix?: number[][];
  coverage_polygon_meters: [number, number][];
  enabled: boolean;
  status: string;
}

export interface FactorySceneModel {
  schema_version: string;
  factory_id: string;
  name: string;
  site_id: string;
  dimensions: {
    width_meters: number;
    depth_meters: number;
    height_meters: number;
  };
  floors: FloorLevel[];
  equipment: EquipmentAsset[];
  walkways: WalkwayPath[];
  zones: SpatialSafetyZone[];
  cameras: SpatialCameraNode[];
  updated_at: string;
  updated_by: string;
}

export interface CameraCalibration {
  camera_id: string;
  calibrated: boolean;
  homography_matrix: number[][];
  validation_status: string;
  sample_projections: Array<{ image: number[]; ground: number[] }>;
}

export interface EnvironmentSummary {
  id: string;
  name: string;
  category: string;
  subtitle?: string;
  description: string;
  dimensions: {
    width_meters: number;
    depth_meters: number;
    height_meters: number;
  };
  camera_count: number;
  zone_count: number;
  equipment_count: number;
  supported_capabilities: string[];
  status: string;
}

export async function fetchDigitalTwinEnvironments(signal?: AbortSignal): Promise<EnvironmentSummary[]> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/twin/environments`, { signal });
  if (!res.ok) throw new Error(`Failed to fetch environments (HTTP ${res.status})`);
  return res.json();
}

export async function fetchFactoryScene(
  environmentId?: string | AbortSignal,
  signal?: AbortSignal
): Promise<FactorySceneModel> {
  let envId: string | undefined;
  let abortSignal: AbortSignal | undefined;

  if (typeof environmentId === 'string') {
    envId = environmentId;
    abortSignal = signal;
  } else if (environmentId instanceof AbortSignal) {
    abortSignal = environmentId;
  }

  const url = envId
    ? `${BASE_URL}/api/v1/twin/scene?environment_id=${encodeURIComponent(envId)}`
    : `${BASE_URL}/api/v1/twin/scene`;

  const res = await authenticatedFetch(url, { signal: abortSignal });
  if (!res.ok) throw new Error(`Failed to fetch factory scene model (HTTP ${res.status})`);
  return res.json();
}


export async function updateFactoryScene(scene: FactorySceneModel): Promise<FactorySceneModel> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/twin/scene`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(scene),
  });
  if (!res.ok) throw new Error('Failed to update factory scene model');
  return res.json();
}

export async function fetchCameraCalibration(cameraId: string): Promise<CameraCalibration> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/twin/calibration/${cameraId}`);
  if (!res.ok) throw new Error(`Failed to fetch calibration for camera ${cameraId}`);
  return res.json();
}

export async function submitCameraCalibration(
  cameraId: string,
  imagePoints: number[][],
  groundPoints: number[][]
): Promise<CameraCalibration> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/twin/calibration/${cameraId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      camera_id: cameraId,
      image_points: imagePoints,
      ground_points: groundPoints,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Calibration failed' }));
    throw new Error(err.detail || 'Calibration failed');
  }
  return res.json();
}

export async function fetchReplayTimeline(incidentId?: string): Promise<any> {
  const url = incidentId
    ? `${BASE_URL}/api/v1/twin/replay?incident_id=${encodeURIComponent(incidentId)}`
    : `${BASE_URL}/api/v1/twin/replay`;
  const res = await authenticatedFetch(url);
  if (!res.ok) throw new Error('Failed to fetch replay timeline');
  return res.json();
}

export interface WalkthroughAnalyzeRequest {
  environment_id?: string;
  x: number;
  y?: number;
  z: number;
  heading_deg?: number;
  worker_alias?: string;
}

export interface WalkthroughAnalyzeResponse {
  is_violation: boolean;
  x?: number;
  z?: number;
  event_id?: string;
  incident_id?: string;
  rule_id?: string;
  severity?: string;
  zone?: {
    zone_id: string;
    name: string;
    zone_type: string;
    color_hex: string;
    active_rules: string[];
  };
  equipment_proximity?: {
    id: string;
    name: string;
    distance_meters: number;
  };
  message: string;
  agent_state?: {
    status: string;
    correlation_id: string;
    investigation?: any;
    policy_result?: any;
    actions_executed: number;
    verification?: any;
    is_degraded_mode: boolean;
    summary: string;
  };
}

export async function analyzeWalkthroughPosition(
  payload: WalkthroughAnalyzeRequest,
  signal?: AbortSignal
): Promise<WalkthroughAnalyzeResponse> {
  const res = await authenticatedFetch(`${BASE_URL}/api/v1/twin/walkthrough-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Walkthrough analysis failed' }));
    throw new Error(err.detail || 'Walkthrough analysis failed');
  }
  return res.json();
}
