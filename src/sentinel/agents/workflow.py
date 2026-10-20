"""
Stateful Multi-Agent Workflow Engine.
Coordinates Agent A (Investigator), Agent B (Policy Gate), Agent C (Responder),
and Agent D (Verifier) with bounded state transitions and failure recovery.
"""

import time
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from sentinel.agents.policy_gate import evaluate_policy
from sentinel.agents.providers.base import BaseLLMProvider
from sentinel.agents.state import (
    ActionRequest,
    AgentState,
    InvestigationResult,
    VerificationResult,
)
from sentinel.agents.tools import execute_tool
from sentinel.db.models import AgentRunModel, ToolExecutionModel
from sentinel.db.repositories.audit_repo import AuditRepository
from sentinel.logging import setup_logging
from sentinel.rules.types import SafetyEventCandidate

logger = setup_logging()


class SafetyAgentWorkflow:
    """Orchestrates the 4-stage bounded safety agent reasoning process."""

    def __init__(self, provider: BaseLLMProvider) -> None:
        self.provider = provider

    async def run(
        self,
        event_candidate: SafetyEventCandidate,
        correlation_id: str,
        session: AsyncSession,
    ) -> AgentState:
        """Executes the complete stateful multi-agent workflow."""
        start_time = time.perf_counter()
        state = AgentState(
            event_candidate=event_candidate,
            correlation_id=correlation_id,
            current_stage="INVESTIGATING",
        )

        try:
            # Stage A: Event Investigator
            await self._run_investigator(state)

            # Stage B: Policy Gate (Deterministic Safety Gate)
            state.current_stage = "EVALUATING_POLICY"
            state.policy_result = evaluate_policy(state)

            # Stage C: Response Agent (Allowlisted Tool Execution)
            state.current_stage = "RESPONDING"
            await self._run_responder(state, session)

            # Stage D: Verification Agent (Real Execution Validation)
            state.current_stage = "VERIFYING"
            await self._run_verifier(state, session)

            state.current_stage = "COMPLETED"

        except Exception as e:
            logger.error(f"Agent workflow error for event {event_candidate.event_id}: {e}")
            state.errors.append(str(e))
            state.current_stage = "FAILED"

        # Persist AgentRun and ToolExecutions to Database
        latency_ms = (time.perf_counter() - start_time) * 1000.0
        await self._persist_agent_run(state, latency_ms, session)

        return state

    async def _run_investigator(self, state: AgentState) -> None:
        """Stage A: Event Investigator gathers and contextualizes evidence."""
        event = state.event_candidate
        prompt = (
            f"Analyze safety event {event.event_id}:\n"
            f"- Event Type: {event.event_type.value}\n"
            f"- Track ID: {event.track_id}\n"
            f"- Zone ID: {event.zone_id or 'N/A'}\n"
            f"- Persistence Count: {event.persistence_count} frames\n"
            f"- Supporting Detections: {len(event.supporting_detections)}\n"
            f"- Uncertainty Reasons: {event.uncertainty_reasons}\n"
            "Produce structured JSON with: summary, cited_evidence_ids, is_sufficient_evidence, missing_evidence, risk_assessment."
        )

        system_instruction = (
            "You are Sentinel AI Safety Investigator. "
            "Cite only verified observations. Do not invent objects, identities, or actions."
        )

        try:
            raw = await self.provider.generate_structured(prompt, system_instruction)
            state.investigation = InvestigationResult(
                summary=raw.get("summary", "Automated spatial event observation."),
                cited_evidence_ids=raw.get(
                    "cited_evidence_ids", [d.class_name for d in event.supporting_detections]
                ),
                is_sufficient_evidence=raw.get("is_sufficient_evidence", True),
                missing_evidence=raw.get("missing_evidence", []),
                risk_assessment=raw.get("risk_assessment", f"Severity: {event.severity.value}"),
            )
        except Exception as e:
            logger.warning(
                f"LLM provider failed; falling back to deterministic degraded investigation: {e}"
            )
            state.is_degraded_mode = True
            state.investigation = InvestigationResult(
                summary=f"Deterministic rule trigger for {event.event_type.value} after {event.persistence_count} verified observations.",
                cited_evidence_ids=[
                    f"det_frame_{i}" for i in range(len(event.supporting_detections))
                ],
                is_sufficient_evidence=True,
                missing_evidence=[],
                risk_assessment=f"Automated deterministic assessment: {event.severity.value}",
            )

    async def _run_responder(self, state: AgentState, session: AsyncSession) -> None:
        """Stage C: Response Agent executes authorized allowlisted tools."""
        if not state.policy_result or not state.policy_result.is_policy_violated:
            logger.info("Policy gate: No violation. No responsive action required.")
            return

        event = state.event_candidate
        incident_id = f"inc_{event.event_id}"
        idemp_incident = f"create_inc:{event.event_id}"
        idemp_alert = f"send_alert:{event.event_id}"

        # 1. Request Incident Creation
        req_inc = ActionRequest(
            tool_name="create_incident",
            parameters={
                "incident_id": incident_id,
                "event_id": event.event_id,
                "title": f"Safety Incident: {event.event_type.value} by Worker #{event.track_id}",
                "severity": state.policy_result.deterministic_severity,
            },
            idempotency_key=idemp_incident,
        )
        state.action_requests.append(req_inc)
        res_inc = await execute_tool(
            session=session,
            tool_name=req_inc.tool_name,
            parameters=req_inc.parameters,
            idempotency_key=req_inc.idempotency_key,
        )
        state.action_results.append(res_inc)

        # 2. Request Notification Alert
        req_alert = ActionRequest(
            tool_name="send_supervisor_alert",
            parameters={
                "incident_id": incident_id,
                "channel": "MOCK_CONSOLE",
                "recipient": "plant_supervisor",
                "message": f"CRITICAL: Worker #{event.track_id} violated safety rule in {event.zone_id or 'workspace'}",
            },
            idempotency_key=idemp_alert,
        )
        state.action_requests.append(req_alert)
        res_alert = await execute_tool(
            session=session,
            tool_name=req_alert.tool_name,
            parameters=req_alert.parameters,
            idempotency_key=req_alert.idempotency_key,
        )
        state.action_results.append(res_alert)

    async def _run_verifier(self, state: AgentState, session: AsyncSession) -> None:
        """Stage D: Verification Agent validates real tool execution outcomes."""
        all_success = all(r.status == "SUCCESS" for r in state.action_results)
        inc_confirmed = any(
            r.tool_name == "create_incident" and r.status == "SUCCESS" for r in state.action_results
        )
        notif_confirmed = any(
            r.tool_name == "send_supervisor_alert" and r.status == "SUCCESS"
            for r in state.action_results
        )

        audit_evidence = (
            f"Actions executed: {len(state.action_results)}. "
            f"Incident Record: {'CONFIRMED' if inc_confirmed else 'NONE'}. "
            f"Notification Dispatch: {'CONFIRMED' if notif_confirmed else 'NONE'}."
        )

        state.verification = VerificationResult(
            is_verified=all_success,
            verification_status="VERIFIED_SUCCESS" if all_success else "PARTIAL_SUCCESS",
            incident_confirmed=inc_confirmed,
            notification_confirmed=notif_confirmed,
            audit_evidence=audit_evidence,
        )

    async def _persist_agent_run(
        self, state: AgentState, latency_ms: float, session: AsyncSession
    ) -> None:
        """Persists agent run metadata and tool executions into the database."""
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        agent_run = AgentRunModel(
            id=run_id,
            event_id=state.event_candidate.event_id,
            correlation_id=state.correlation_id,
            status=state.current_stage,
            provider=self.provider.provider_name,
            model_name=self.provider.model_name,
            latency_ms=round(latency_ms, 2),
            shared_state_json=state.model_dump(mode="json"),
        )
        session.add(agent_run)
        await session.flush()

        # Tool execution records
        for req, res in zip(state.action_requests, state.action_results):
            tool_exec = ToolExecutionModel(
                id=f"tool_{uuid.uuid4().hex[:12]}",
                agent_run_id=run_id,
                tool_name=res.tool_name,
                idempotency_key=req.idempotency_key,
                arguments_json=req.parameters,
                result_json=res.output,
                status=res.status,
            )
            session.add(tool_exec)

        # Audit record
        audit_repo = AuditRepository(session)
        await audit_repo.log_action(
            correlation_id=state.correlation_id,
            actor="AgentOrchestrator",
            action="AGENT_WORKFLOW_EXECUTION",
            resource_type="SAFETY_EVENT",
            resource_id=state.event_candidate.event_id,
            outcome=state.current_stage,
            details={
                "latency_ms": round(latency_ms, 2),
                "verified": state.verification.is_verified if state.verification else False,
            },
        )
        await session.flush()
