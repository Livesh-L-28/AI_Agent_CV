# SENTINEL AI — Stateful Multi-Agent System Architecture

## 1. Overview
The agentic layer of SENTINEL AI is designed under a core safety principle: **Deterministic Safety Authority**.
Probabilistic Large Language Models (LLMs) operate as investigative assistants that contextualize and summarize sensor evidence; however, safety policy evaluation, severity assignment, and response execution are strictly governed by deterministic code gates.

```
+---------------------------------------------------------------------------------------------------+
|                                  STAGE A: EVENT INVESTIGATOR                                      |
|  - Ingests event candidate, persistence history, spatial zones, and supporting bounding boxes.     |
|  - Grounds reasoning in verified evidence IDs (cannot hallucinate unseen objects or actions).     |
|  - Produces structured InvestigationResult; outputs explicit UNCERTAIN if evidence is missing.    |
+-------------------------------------------------+-------------------------------------------------+
                                                  v
+---------------------------------------------------------------------------------------------------+
|                           STAGE B: DETERMINISTIC POLICY GATE (Hard Coded)                         |
|  - Applies OSHA and facility policies directly without LLM discretion.                            |
|  - Enforces persistence thresholds (5 frames for zones, 6 frames for PPE).                        |
|  - Automatically overrides and rejects any hallucinated LLM safety waivers.                       |
+-------------------------------------------------+-------------------------------------------------+
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                   STAGE C: RESPONSE AGENT                                         |
|  - Selects actions exclusively from an allowlisted tool registry.                                 |
|  - Enforces idempotency keys (e.g. `create_inc:{event_id}`) to block duplicate notifications.     |
|  - Strictly disallows shell execution, arbitrary Python, or unrestricted network calls.          |
+-------------------------------------------------+-------------------------------------------------+
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                 STAGE D: VERIFICATION AGENT                                       |
|  - Directly inspects actual database transaction records and notification dispatch results.       |
|  - Distinguishes VERIFIED_SUCCESS from partial success or tool failure.                           |
|  - Prevents the system from claiming an unverified action succeeded.                              |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Shared Typed State (`AgentState`)

```python
class AgentState(BaseModel):
    event_candidate: SafetyEventCandidate
    correlation_id: str
    investigation: Optional[InvestigationResult]
    policy_result: Optional[PolicyResult]
    action_requests: list[ActionRequest]
    action_results: list[ActionResult]
    verification: Optional[VerificationResult]
    current_stage: str
    retry_count: int = 0
    errors: list[str] = []
    is_degraded_mode: bool = False
```

---

## 3. Allowlisted Tools & Security Restrictions

| Tool Name | Parameters | Purpose | Security Constraints |
| :--- | :--- | :--- | :--- |
| `create_incident` | `incident_id, event_id, title, severity` | Persists confirmed incident | Atomic DB transaction, idempotent |
| `send_supervisor_alert` | `incident_id, channel, recipient, message` | Alerts plant supervisor | Idempotency key blocks duplicate alerts; mock sink during tests |
| `request_human_review` | `incident_id, reason` | Escalates to human supervisor | Audited state transition |
| `get_incident_status` | `incident_id` | Status lookup | Read-only |

Any attempt by an LLM to call an unlisted tool (e.g., `bash`, `eval`, `raw_sql`) is intercepted and rejected with `REJECTED_UNAUTHORIZED`.

---

## 4. Failure Recovery & Degraded Mode
- **LLM Timeout / Service Outage**: If the local Ollama instance or external model times out or returns malformed JSON, the workflow enters **Degraded Mode** (`is_degraded_mode = True`).
- **Safety Continuity**: Even in degraded mode, the deterministic policy gate still fires, records the incident, triggers alerts, and logs an audit trail. An LLM outage **never** compromises physical safety monitoring.
