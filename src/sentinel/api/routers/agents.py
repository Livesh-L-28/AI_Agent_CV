"""
Agent Execution and Investigation Trace API Router.
Protected with server-side JWT authentication and role-based access control.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from sentinel.agents.providers import get_llm_provider
from sentinel.agents.workflow import SafetyAgentWorkflow
from sentinel.db.models import AgentRunModel, SafetyEventModel
from sentinel.db.session import get_db_session
from sentinel.logging import get_correlation_id
from sentinel.rules.types import EventSeverity, EventType, SafetyEventCandidate
from sentinel.security.auth import AuthenticatedUser, UserRole, require_role

router = APIRouter(prefix="/api/v1/agents", tags=["Agents"])


@router.post("/investigate/{event_id}")
async def trigger_agent_investigation(
    event_id: str,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
) -> dict[str, Any]:
    """
    Triggers the 4-stage agentic workflow to investigate a safety event.
    Requires SAFETY_OFFICER or ADMIN role.
    """
    async with get_db_session() as session:
        # 1. Fetch safety event from DB
        stmt = select(SafetyEventModel).where(SafetyEventModel.id == event_id)
        res = await session.execute(stmt)
        event = res.scalar_one_or_none()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Safety event '{event_id}' not found",
            )

        # 2. Reconstitute candidate
        candidate = SafetyEventCandidate(
            event_id=event.id,
            event_type=EventType(event.event_type),
            severity=EventSeverity(event.severity),
            source_id=event.source_id,
            track_id=event.track_id,
            zone_id=event.zone_id,
            rule_id=event.rule_id,
            first_observation_ns=event.first_observation_ns,
            last_observation_ns=event.last_observation_ns,
            persistence_count=event.persistence_count,
            confidence=event.confidence,
            deduplication_key=event.deduplication_key,
            metadata=event.meta_json,
        )

        # 3. Execute workflow
        cid = get_correlation_id() or f"corr_{event_id}"
        provider = get_llm_provider()
        workflow = SafetyAgentWorkflow(provider)

        state = await workflow.run(
            event_candidate=candidate,
            correlation_id=cid,
            session=session,
        )

        return {
            "status": state.current_stage,
            "correlation_id": state.correlation_id,
            "investigation": state.investigation.model_dump() if state.investigation else None,
            "policy_result": state.policy_result.model_dump() if state.policy_result else None,
            "actions_executed": len(state.action_results),
            "verification": state.verification.model_dump() if state.verification else None,
            "is_degraded_mode": state.is_degraded_mode,
            "investigated_by": user.username,
        }


@router.get("/runs/{run_id}")
async def get_agent_run(
    run_id: str,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.VIEWER, UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
) -> dict[str, Any]:
    """Retrieves an agent run's complete execution trace and tool logs. Requires authenticated user."""
    async with get_db_session() as session:
        stmt = select(AgentRunModel).where(AgentRunModel.id == run_id)
        res = await session.execute(stmt)
        run = res.scalar_one_or_none()
        if not run:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Agent run '{run_id}' not found",
            )

        return {
            "run_id": run.id,
            "event_id": run.event_id,
            "correlation_id": run.correlation_id,
            "status": run.status,
            "provider": run.provider,
            "model_name": run.model_name,
            "latency_ms": run.latency_ms,
            "shared_state": run.shared_state_json,
            "created_at": run.created_at.isoformat(),
        }
