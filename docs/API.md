# SENTINEL AI — REST API & Streaming Specification

## 1. Overview
The SENTINEL AI backend provides an asynchronous, versioned REST API built on FastAPI, complemented by WebSocket streaming for real-time video telemetry and instant safety alert feeds.

---

## 2. Global Headers & Correlation Tracking
Every request to the API automatically generates or propagates a correlation ID:
- **`X-Correlation-ID`**: A stable tracking identifier attached to all logs, database audit records, and downstream agent workflows.
- **`X-Process-Time-Ms`**: Server-side request execution duration in milliseconds.

---

## 3. Core Endpoints

### 3.1 Health & Readiness Probes
| Endpoint | Method | Description | Success Response |
| :--- | :--- | :--- | :--- |
| `/health/live` | `GET` | Process liveness check | `{"status": "live", "timestamp": "..."}` |
| `/health/ready` | `GET` | Database and engine readiness check | `{"status": "ready", "database_connected": true, ...}` |

### 3.2 Video Source Management (`/api/v1/sources`)
| Endpoint | Method | Description | Request / Parameters |
| :--- | :--- | :--- | :--- |
| `/api/v1/sources` | `POST` | Register a new camera or replay stream | `{"source_id": "...", "name": "...", "source_type": "replay", "uri": "..."}` |
| `/api/v1/sources` | `GET` | List all configured video sources | *None* |
| `/api/v1/sources/{id}/start` | `POST` | Transition source state to `RUNNING` | `source_id` path param |
| `/api/v1/sources/{id}/stop` | `POST` | Safely release source handles and stop | `source_id` path param |

### 3.3 Safety Events & Incidents
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/events` | `GET` | List detected safety event candidates (supports `event_type`, `source_id` filters) |
| `/api/v1/events/{id}` | `GET` | Retrieve specific safety event candidate details |
| `/api/v1/incidents` | `GET` | List confirmed incidents (supports `status` filter: `OPEN`, `RESOLVED`, `ESCALATED`) |
| `/api/v1/incidents/{id}` | `GET` | Retrieve incident details with linked evidence and notifications |
| `/api/v1/incidents/{id}/review` | `POST` | Supervisory human review (`{"action": "RESOLVE", "reviewer_name": "...", "notes": "..."}`) |

### 3.4 Platform Analytics (`/api/v1/analytics`)
| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/v1/analytics/summary` | `GET` | High-level KPI aggregations (total events, open incidents, active cameras) |
| `/api/v1/analytics/vision` | `GET` | Hardware acceleration device, FPS, and detector latency benchmarks |

### 3.5 Real-Time Streaming (`/api/v1/stream`)
- **Protocol**: WebSocket (`ws://` / `wss://`)
- **Endpoint**: `/api/v1/stream`
- **Payloads**:
  - `HANDSHAKE`: On connection establishment.
  - `SAFETY_EVENT`: Immediate broadcast of confirmed restricted-zone or PPE violations.
  - `FRAME_TELEMETRY`: Worker counts, tracking IDs, and bounding boxes.
