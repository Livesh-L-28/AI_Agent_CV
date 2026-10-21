# SENTINEL AI — Release Risks, Defect Register & Remediation Roadmap

**Document Version:** 1.0.0  
**Status:** Official Release Risk Assessment  
**Target Release Phase:** Pre-Release Security & Safety Review  
**Auditor:** Principal CV Engineer, Security Auditor & Backend Reviewer  

---

## 1. Severity-Ranked Defect Register

Findings are prioritized according to standard industrial software classification:
- **P0 (Critical):** Immediate safety or security blocker. Prevents secure operation or risks unauthorized access/spoofing.
- **P1 (Major):** Correctness, reliability, or model compatibility issue. Degrades operational safety decisions or causes false positives/negatives.
- **P2 (Medium):** Important engineering defect, partial mock implementation, or reproducibility limitation.
- **P3 (Minor):** Documentation inconsistency, polish, or minor UI cosmetic defect.

---

### P0: Critical Safety & Security Defects

#### DEF-01: Total Absence of API Authentication and Role Verification
- **Severity:** **P0** (Critical)
- **Module:** API / Authentication
- **Affected Files:**
  - [`src/sentinel/api/app.py:L1-120`](file:///Users/livesh/AI_Agent_CV/src/sentinel/api/app.py#L1-L120)
  - [`src/sentinel/api/routers/agents.py:L40-80`](file:///Users/livesh/AI_Agent_CV/src/sentinel/api/routers/agents.py#L40-L80)
  - [`src/sentinel/api/routers/incidents.py:L50-100`](file:///Users/livesh/AI_Agent_CV/src/sentinel/api/routers/incidents.py#L50-L100)
- **Description:**
  All REST API routes and WebSocket connections are unauthenticated. While internal tools check `caller_role`, callers can supply any string (e.g. `caller_role="safety_officer"` or `"admin"`) in the HTTP request payload to execute sensitive agent actions, dismiss incidents, or trigger simulated evacuations.
- **Exploitation Scenario:**
  An adversary on the local network sends a POST request to `/api/v1/agents/investigate` with a spoofed high-privilege role, suppressing real alerts or fabricating false alarms.
- **Remediation:**
  Implement JWT Bearer authentication or mTLS. Bind caller identity and RBAC claims to verified cryptographic session tokens rather than client-supplied JSON parameters.

---

### P1: Major Correctness & Reliability Defects

#### DEF-02: Checkpoint Class Map Incompatibility (No Industrial PPE Classes)
- **Severity:** **P1** (Major)
- **Module:** Vision Pipeline / Rules
- **Affected Files:**
  - [`src/sentinel/vision/adapter.py:L42-95`](file:///Users/livesh/AI_Agent_CV/src/sentinel/vision/adapter.py#L42-L95)
  - [`src/sentinel/rules/ppe.py:L107-160`](file:///Users/livesh/AI_Agent_CV/src/sentinel/rules/ppe.py#L107-L160)
- **Description:**
  The default detector uses `yolov8n.pt`, a general-purpose COCO-80 pretrained model. It recognizes `person`, `car`, and `dog`, but contains zero weights for `hard_hat`, `safety_vest`, `goggles`, or `harness`.
- **Impact:**
  In real camera streams, `ppe_items` will never contain safety equipment. Every worker entering a PPE-required zone will be falsely flagged as non-compliant.
- **Remediation:**
  Replace `yolov8n.pt` with a fine-tuned PPE detector (e.g. YOLOv8 trained on SHWD or Pictor PPE datasets) or incorporate a dual-head model architecture.

#### DEF-03: Synthetic Video Detector Incompatibility (Zero Detections Fallback)
- **Severity:** **P1** (Major)
- **Module:** Evaluation / Synthetic Fixtures
- **Affected Files:**
  - [`scripts/demo_runner.py:L147-162`](file:///Users/livesh/AI_Agent_CV/scripts/demo_runner.py#L147-L162)
  - [`tests/test_e2e.py:L102-124`](file:///Users/livesh/AI_Agent_CV/tests/test_e2e.py#L102-L124)
  - [`data/evaluation/vision_benchmark.json:L22`](file:///Users/livesh/AI_Agent_CV/data/evaluation/vision_benchmark.json#L22)
- **Description:**
  The synthetic video `synthetic_safety_video.mp4` renders geometric cartoons that are not recognized by the COCO person detector (`"total_detections": 0`). The demo script and E2E test bypass this failure by injecting a hardcoded fallback candidate `SafetyEventCandidate(event_id="evt_e2e_synthetic_01", ...)`.
- **Impact:**
  Automated tests and live demos do not validate the computer vision detector's real-world person tracking against dynamic video frames.
- **Remediation:**
  Supply photorealistic synthetic video fixtures (e.g., generated with Unreal Engine / Blender) or short anonymized industrial CCTV clips where humans are reliably detected.

#### DEF-04: Frame-Count Based Persistence Vulnerable to Rate Fluctuations
- **Severity:** **P1** (Major)
- **Module:** Rules / Temporal Engine
- **Affected Files:**
  - [`src/sentinel/rules/temporal_engine.py:L115-130`](file:///Users/livesh/AI_Agent_CV/src/sentinel/rules/temporal_engine.py#L115-L130)
- **Description:**
  Zone violations trigger when `consecutive_inside >= 5` frames. In IP camera environments subject to network jitter, packet drop, or variable FPS (e.g. 10 FPS to 60 FPS), 5 frames equates to physical durations ranging from 83 ms to 500 ms.
- **Impact:**
  False positives when a worker briefly brushes past a boundary at low FPS, or delayed alerting during high FPS streams.
- **Remediation:**
  Migrate persistence calculation to elapsed wall-clock or monotonic frame timestamps:
  `elapsed_ns = current_timestamp_ns - first_observation_ns >= persistence_duration_ns`.

#### DEF-05: Single-Frame Track Occlusion Causes Premature Violation Termination
- **Severity:** **P1** (Major)
- **Module:** Rules / Temporal Engine
- **Affected Files:**
  - [`src/sentinel/rules/temporal_engine.py:L213-222`](file:///Users/livesh/AI_Agent_CV/src/sentinel/rules/temporal_engine.py#L213-L222)
- **Description:**
  While the multi-object tracker retains occluded tracks for up to 15 frames (`max_lost_frames=15`), the temporal engine auto-closes an active violation on the very first frame a track is absent:
  `lost_tracks = self.known_active_tracks - current_frame_tracks`.
- **Impact:**
  A worker momentarily occluded by an obstacle creates fragmented multiple incident tickets in the database instead of a single continuous event.
- **Remediation:**
  Sync `TemporalEventEngine` violation termination with tracker lifecycle (`track.state == TrackState.DELETED`).

#### DEF-06: Hardcoded Vision Telemetry in Analytics Router
- **Severity:** **P1** (Major)
- **Module:** Backend API
- **Affected Files:**
  - [`src/sentinel/api/routers/analytics.py:L63-71`](file:///Users/livesh/AI_Agent_CV/src/sentinel/api/routers/analytics.py#L63-L71)
- **Description:**
  The endpoint `/api/v1/analytics/vision` returns static, hardcoded constants (`average_latency_ms: 12.30`, `detected_persons: 42`, `frames_processed: 125`) rather than aggregating real inference metrics.
- **Remediation:**
  Implement an in-memory ring buffer or Prometheus counter collecting live inference durations and active track statistics.

#### DEF-07: Unverified Evidence Asset Hashes on Retrieval
- **Severity:** **P1** (Major)
- **Module:** Database / Evidence Repository
- **Affected Files:**
  - [`src/sentinel/db/repositories/evidence_repo.py:L40-75`](file:///Users/livesh/AI_Agent_CV/src/sentinel/db/repositories/evidence_repo.py#L40-L75)
- **Description:**
  SHA-256 hashes are computed when evidence assets are registered, but `get_by_id()` does not re-read the file from disk or compare its current digest against `sha256_hash`.
- **Impact:**
  Silent disk corruption or unauthorized alteration of evidence images goes undetected by the application.
- **Remediation:**
  Recompute the SHA-256 hash during retrieval and raise an `EvidenceTamperException` if the digest does not match.

---

### P2: Medium Engineering & Reproducibility Defects

#### DEF-08: Monocular Bottom-Center Parallax Distortion
- **Severity:** **P2** (Medium)
- **Module:** Rules / Geometry
- **Affected Files:**
  - [`src/sentinel/rules/geometry.py:L51-64`](file:///Users/livesh/AI_Agent_CV/src/sentinel/rules/geometry.py#L51-L64)
- **Description:**
  Approximating ground contact using the 2D bounding box bottom-center `((x1+x2)/2, y2)` is inaccurate when cameras are tilted or positioned at oblique angles.
- **Remediation:**
  Support optional 4-point planar homography calibration to map 2D image coordinates to bird's-eye-view floor coordinates.

#### DEF-09: Missing Evidence Asset Download / Export Endpoint
- **Severity:** **P2** (Medium)
- **Module:** Backend API
- **Affected Files:**
  - [`src/sentinel/api/routers/incidents.py`](file:///Users/livesh/AI_Agent_CV/src/sentinel/api/routers/incidents.py)
- **Description:**
  The API provides metadata for evidence assets, but does not provide a streaming endpoint (`GET /api/v1/incidents/{id}/evidence/{asset_id}/download`) to view or export the JPEG crop.
- **Remediation:**
  Add a dedicated file streaming endpoint protected by authorization headers.

#### DEF-10: Client-Side Simulation in Live Monitor UI
- **Severity:** **P2** (Medium)
- **Module:** Frontend / LiveMonitor
- **Affected Files:**
  - [`frontend/src/pages/LiveMonitor.tsx:L128-175`](file:///Users/livesh/AI_Agent_CV/frontend/src/pages/LiveMonitor.tsx#L128-L175)
- **Description:**
  `LiveMonitor.tsx` renders a synthetic HTML5 canvas animation with hardcoded latency indicators rather than rendering backend video feeds or WebSocket inference overlays.
- **Remediation:**
  Connect the HTML5 canvas to the backend `/api/v1/stream` multipart stream or WebSocket telemetry channel.

---

### P3: Documentation & Polish Defects

#### DEF-11: Docker Compose Version Attribute Deprecation Warning
- **Severity:** **P3** (Minor)
- **Module:** Deployment
- **Affected Files:**
  - [`docker-compose.yml:L1`](file:///Users/livesh/AI_Agent_CV/docker-compose.yml#L1)
- **Description:**
  Modern Docker Compose v2 emits a deprecation warning regarding the top-level `version: '3.8'` key.
- **Remediation:**
  Remove the obsolete `version: '3.8'` line from `docker-compose.yml`.

#### DEF-12: Uncalibrated OSHA Legal Disclaimer
- **Severity:** **P3** (Minor)
- **Module:** Documentation / Policies
- **Affected Files:**
  - [`docs/DECISIONS.md`](file:///Users/livesh/AI_Agent_CV/docs/DECISIONS.md)
  - [`docs/ARCHITECTURE.md`](file:///Users/livesh/AI_Agent_CV/docs/ARCHITECTURE.md)
- **Description:**
  Documentation refers to OSHA compliance without an explicit legal disclaimer clarifying that software monitoring does not constitute certified occupational safety equipment.
- **Remediation:**
  Add prominent disclaimer: *"SENTINEL AI is an advisory software monitoring system and does not replace certified industrial safety gear or human oversight."*

---

## 2. Risk Classification Matrix

```
       ▲
       │  [High Impact]
       │    DEF-02 (No PPE classes)          DEF-01 (No API Auth)
       │    DEF-04 (Frame persistence)       DEF-03 (Synthetic video gap)
IMPACT │
       │  [Medium Impact]
       │    DEF-05 (Occlusion loss)          DEF-06 (Hardcoded analytics)
       │    DEF-08 (Parallax distortion)     DEF-07 (Unverified hash)
       │
       │  [Low Impact]
       │    DEF-11 (Compose warning)         DEF-09 (Missing download API)
       │    DEF-12 (OSHA disclaimer)         DEF-10 (UI canvas simulation)
       └─────────────────────────────────────────────────────────────►
                     [Low Likelihood]            [High Likelihood]
                                   PROBABILITY
```

---

## 3. Adversarial and Operational Threat Analysis

### Threat Scenario A: Unauthorized Remote Alert Dismissal (Exploiting DEF-01)
- **Attacker Goal:** Dismiss ongoing safety violations to avoid incident investigation.
- **Attack Vector:** An attacker discovers port 8000 exposed on the internal network. The attacker sends a `PATCH` request to `/api/v1/incidents/inc_12345/status` with `status: "RESOLVED"` and `dismissal_reason: "False positive"`.
- **System Behavior:** Because no JWT/session validation is enforced, the database updates immediately, and the incident is closed without human safety officer authorization.

### Threat Scenario B: False Alarm Flood via Stream Jitter (Exploiting DEF-04)
- **Trigger:** High network traffic causes RTSP camera framerate to drop from 30 FPS to 2 FPS.
- **System Behavior:** A worker momentarily steps 10 cm over the zone boundary for 2 seconds. At 2 FPS, this spans 4 frames. If the frame rate stutters and delivers 5 clustered frames, a critical emergency violation is triggered, halting factory workflows.

### Threat Scenario C: Evidence Tampering without Audit Detection (Exploiting DEF-07)
- **Attacker Goal:** Modify an evidence crop image to hide worker identity or safety infraction.
- **Attack Vector:** A local operator replaces `evidence_123.jpg` on the file server with an edited image.
- **System Behavior:** When an investigator requests the incident in the web dashboard, the backend serves the modified file without detecting that the file's current SHA-256 digest no longer matches the database record.

---

## 4. Prioritized Remediation Roadmap

### Phase 1: Pre-Demo Hardening (Immediate)
*Target: Prepare for safe, reliable stakeholder demonstrations.*

1. **Fix Analytics Router (`DEF-06`):**
   Replace hardcoded numbers in `/api/v1/analytics/vision` with dynamic queries from the active pipeline and SQLite database.
2. **Implement Evidence Retrieval Verification (`DEF-07`):**
   Add checksum verification in `EvidenceAssetRepository.get_by_id()`:
   ```python
   current_hash = hashlib.sha256(file_path.read_bytes()).hexdigest()
   if current_hash != model.sha256_hash:
       raise TamperedEvidenceError(f"Evidence {model.id} checksum mismatch!")
   ```
3. **Fix Single-Frame Track Occlusion (`DEF-05`):**
   Prevent premature closure of active violations in `TemporalEventEngine` until the tracker explicitly transitions the track to `TrackState.DELETED`.
4. **Transition to Monotonic Timestamp Persistence (`DEF-04`):**
   Update `TemporalEventEngine` to require `(timestamp_ns - first_seen_ns) >= 200_000_000` (200 ms).

### Phase 2: Pilot Staging Security (Required Before Network Deployment)
*Target: Allow multi-user access on private corporate intranet.*

1. **Implement JWT Bearer Authentication & RBAC (`DEF-01`):**
   - Add `fastapi-jwt` or OAuth2 password bearer middleware.
   - Enforce `@require_role("safety_officer")` decorators across all incident and agent execution routes.
2. **Add Evidence Download Endpoint (`DEF-09`):**
   Implement `GET /api/v1/incidents/{incident_id}/evidence/{asset_id}/download` returning a streaming response with proper `Content-Type: image/jpeg` and security headers.
3. **Integrate Real Live Video Stream into Frontend (`DEF-10`):**
   Replace client-side canvas simulation in `LiveMonitor.tsx` with a live stream component consuming `/api/v1/stream`.

### Phase 3: Industrial Pilot & Vision Fine-Tuning
*Target: Real-world factory floor trial.*

1. **Deploy Fine-Tuned Industrial PPE Checkpoint (`DEF-02`):**
   Fine-tune YOLOv8 on real factory PPE datasets (detecting `person`, `hard_hat`, `safety_vest`, `protective_goggles`).
2. **Acquire Realistic Video Fixtures (`DEF-03`):**
   Record high-definition test sequences of human workers walking through physical safety zones to replace cartoon fixtures.
3. **Implement Planar Homography Transformation (`DEF-08`):**
   Provide a 4-point zone calibration UI in `ZoneConfig.tsx` to eliminate perspective parallax on floor boundaries.
