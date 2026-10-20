# SENTINEL AI — Security Architecture & Threat Model

## 1. Security Philosophy & Architectural Invariants

SENTINEL AI is designed under a **Zero-Trust Safety & Security Paradigm** tailored for high-risk industrial facilities (manufacturing, robotics bays, construction, oil & gas).

In mission-critical industrial environments, the application of Large Language Models (LLMs) introduces non-deterministic behavior, hallucinations, and prompt injection vulnerabilities. To eliminate risk to human life, SENTINEL AI enforces **Strict Separation of Concerns**:

$$\text{Computer Vision \& Spatial Rules} \longrightarrow \mathbf{\text{Deterministic Policy Authority}} \longleftarrow \text{LLM Reasoning (Investigative Assistant Only)}$$

### Core Security Invariants:
1. **The LLM is Never the Safety Authority:** The LLM cannot create, modify, dismiss, or override an industrial safety rule. Spatial point-in-polygon containment and temporal persistence checks are hard-coded in deterministic Python.
2. **Zero Arbitrary Execution:** Agents interact with external systems exclusively via permission-gated, allowlisted tools. Arbitrary code execution (`eval`, `exec`, `subprocess`, shell) is strictly prohibited.
3. **Cryptographic Chain of Custody:** Every audited frame and incident record is sealed with an immutable SHA-256 cryptographic digest.
4. **Data Minimization:** No continuous video recording is stored on disk; transient frames exist solely in RAM buffers and are immediately discarded unless an audited safety violation is confirmed.

---

## 2. Threat Modeling & Mitigation Matrix (STRIDE)

| Threat Category (STRIDE) | Attack Vector / Scenario | System Impact | SENTINEL AI Mitigation Architecture |
| :--- | :--- | :--- | :--- |
| **Spoofing** | Adversary attempts to impersonate plant supervisor or API client | Unauthorized access to incident logs | JWT Bearer authentication, source IP verification, and RBAC middleware. |
| **Tampering** | Rogue actor or malware attempts to alter evidence images to conceal an accident | Evidence corruption, legal liability | Every evidence crop is hashed with **SHA-256** upon generation; hashes are stored in immutable audit logs (`EvidenceModel.sha256_hash`). |
| **Repudiation** | Operator denies having dismissed or acknowledged a critical safety violation | Unaccountable operations | Complete event trace with monotonic timestamp, UUIDv7 correlation ID, and operator identity logged to `AuditLogModel`. |
| **Information Disclosure** | Leakage of proprietary plant layout or confidential worker identities | Compliance violation, IP theft | Worker identities are pseudonymized as integer `track_id` values; camera feeds are processed on-premise via edge models (YOLO / local Ollama) with zero external cloud egress. |
| **Denial of Service** | Flash flood of synthetic detections or alert storm exhausting SMS/Pager sinks | Supervisor alert fatigue, notification outage | Bounded FIFO ring buffer (`BoundedFrameBuffer`) with automatic frame dropping under backpressure; mandatory **Idempotency Keys** on notification sinks. |
| **Elevation of Privilege** | **Adversarial Prompt Injection:** Malicious text in worker name or prompt tricking LLM to run system commands | Host compromise, remote code execution | Multi-layered tool permission gate (`ALLOWLISTED_TOOLS`); policy engine rejects unauthorized tool names with `REJECTED_UNAUTHORIZED`. |

---

## 3. The 4-Stage Agent Security Boundary

```
+-------------------------------------------------------------------------+
|                        STAGE A: INVESTIGATOR                            |
|  - Ingests structured detections & spatial metadata                     |
|  - Proposes investigation notes & candidate action requests             |
+-------------------------------------------------------------------------+
                                    |
                                    v
+=========================================================================+
|             STAGE B: DETERMINISTIC POLICY GATE (SECURITY BARRIER)       |
|  - Evaluates hard-coded OSHA & plant rules against ground truth         |
|  - Categorically rejects any prompt-injected or unauthorized actions    |
|  - Non-overridable by LLM prompts                                       |
+=========================================================================+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                        STAGE C: RESPONDER                               |
|  - Executes strictly ALLOWLISTED tools:                                 |
|      * create_incident(incident_id, event_id, title, severity)          |
|      * send_supervisor_alert(recipient, message, idempotency_key)       |
|      * request_human_review(incident_id, reason)                        |
|      * get_incident_status(incident_id)                                 |
|  - Enforces mandatory idempotency keys                                  |
+-------------------------------------------------------------------------+
                                    |
                                    v
+-------------------------------------------------------------------------+
|                        STAGE D: VERIFIER                                |
|  - Queries real database records to confirm tool side-effects occurred  |
|  - Emits cryptographically verifiable audit trail                       |
+-------------------------------------------------------------------------+
```

### 3.1 Allowlisted Tools Specification

Under `src/sentinel/agents/tools.py`, only four explicitly defined functions may ever be dispatched:

```python
ALLOWLISTED_TOOLS = {
    "create_incident",
    "send_supervisor_alert",
    "request_human_review",
    "get_incident_status",
}
```

Any tool request not matching this exact set immediately halts execution, logs a critical security alert, and returns:
```json
{
  "status": "REJECTED_UNAUTHORIZED",
  "error": "Tool 'execute_system_command' is not in the authorized Sentinel AI allowlist"
}
```

---

## 4. Idempotency & Alert Storm Prevention

To prevent cascading failures and alert storms (e.g., automated agents repeatedly firing emergency messages during continuous worker presence):
- Every alert request requires a unique `idempotency_key` (derived deterministically from event ID and rule ID).
- The alert service queries the `NotificationModel` table for an existing key before dispatching.
- If a record exists, the tool immediately returns:
```json
{
  "notification_id": "notif_existing_hash",
  "duplicate_prevented": true
}
```
Zero duplicate external network calls or SMS messages are generated.

---

## 5. Cryptographic Evidence Hashing & Verification

When a violation triggers an audited event snapshot:
1. The cropped frame is encoded to JPEG format.
2. The raw byte sequence is hashed via `hashlib.sha256(image_bytes).hexdigest()`.
3. The resulting 64-character hexadecimal digest is recorded alongside the file path in `EvidenceModel`.
4. Any subsequent attempt to tamper with or replace the image file can be detected by comparing the stored hash against the recalculation:

```python
computed_hash = hashlib.sha256(stored_file.read_bytes()).hexdigest()
if computed_hash != evidence_record.sha256_hash:
    raise EvidenceTamperingDetected("Cryptographic evidence mismatch!")
```

---

## 6. Vulnerability Reporting & Secure Development

- **Automated Dependency Auditing:** GitHub Actions executes daily `pip-audit` and dependency scanning.
- **Static Analysis:** Codebase is validated on every pull request with Ruff linter rules (`E`, `F`, `I`, `W`).
- **Reporting Security Issues:** Send encrypted reports to `security@sentinel-ai.internal`.
