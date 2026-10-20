"""
Integration tests for the 4-Stage Stateful Agent Workflow (Investigator, Policy Gate, Responder, Verifier).
"""

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from sentinel.agents.providers.mock import DeterministicMockProvider
from sentinel.agents.providers.ollama import OllamaProvider
from sentinel.agents.workflow import SafetyAgentWorkflow
from sentinel.db.models import AgentRunModel, IncidentModel, NotificationModel
from sentinel.db.repositories.event_repo import EventRepository
from sentinel.db.repositories.source_repo import SourceRepository
from sentinel.db.session import get_db_session, init_db
from sentinel.rules.types import EventSeverity, EventType, SafetyEventCandidate


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.mark.asyncio
async def test_full_agent_workflow_success():
    provider = DeterministicMockProvider()
    workflow = SafetyAgentWorkflow(provider)

    candidate = SafetyEventCandidate(
        event_id="evt_agent_test_01",
        event_type=EventType.ZONE_ENTRY,
        severity=EventSeverity.CRITICAL,
        source_id="cam-bay-01",
        track_id=101,
        zone_id="zone-crane-hazard",
        rule_id="RULE_CRANE_RESTRICTED",
        first_observation_ns=1000,
        last_observation_ns=5000,
        persistence_count=5,
        confidence=0.96,
        deduplication_key="cam-bay-01:101:zone-crane-hazard:ZONE_ENTRY",
        uncertainty_reasons=[],
    )

    # Pre-populate source and event in database
    async with get_db_session() as session:
        src_repo = SourceRepository(session)
        await src_repo.create_source("cam-bay-01", "Bay Camera", "replay", "video.mp4")
        evt_repo = EventRepository(session)
        await evt_repo.create_from_candidate(candidate)

    # Execute Agent Workflow
    async with get_db_session() as session:
        state = await workflow.run(
            event_candidate=candidate,
            correlation_id="corr-test-agent-01",
            session=session,
        )

    # 1. Stage A Validation
    assert state.investigation is not None
    assert state.investigation.is_sufficient_evidence is True
    assert len(state.investigation.cited_evidence_ids) > 0

    # 2. Stage B Validation (Deterministic Policy Gate)
    assert state.policy_result is not None
    assert state.policy_result.is_policy_violated is True
    assert state.policy_result.deterministic_severity == "CRITICAL"
    assert state.policy_result.recommended_action == "CREATE_INCIDENT_AND_ALERT"

    # 3. Stage C Validation (Action Execution)
    assert len(state.action_requests) == 2
    assert len(state.action_results) == 2
    assert all(r.status == "SUCCESS" for r in state.action_results)

    # 4. Stage D Validation (Verification Gate)
    assert state.verification is not None
    assert state.verification.is_verified is True
    assert state.verification.incident_confirmed is True
    assert state.verification.notification_confirmed is True
    assert state.current_stage == "COMPLETED"

    # 5. Database State Verification
    async with get_db_session() as session:
        inc = await session.scalar(
            select(IncidentModel).where(IncidentModel.id == "inc_evt_agent_test_01")
        )
        assert inc is not None
        assert inc.severity == "CRITICAL"
        assert inc.status == "OPEN"

        notif = await session.scalar(
            select(NotificationModel).where(
                NotificationModel.incident_id == "inc_evt_agent_test_01"
            )
        )
        assert notif is not None
        assert notif.status == "SENT"

        run = await session.scalar(
            select(AgentRunModel).where(AgentRunModel.event_id == "evt_agent_test_01")
        )
        assert run is not None
        assert run.status == "COMPLETED"
        assert run.provider == "mock"


@pytest.mark.asyncio
async def test_agent_degraded_fallback_on_provider_error():
    # Simulate LLM timeout
    provider = DeterministicMockProvider(simulate_timeout=True)
    workflow = SafetyAgentWorkflow(provider)

    candidate = SafetyEventCandidate(
        event_id="evt_timeout_01",
        event_type=EventType.PPE_VIOLATION,
        severity=EventSeverity.HIGH,
        source_id="cam-ppe",
        track_id=88,
        rule_id="RULE_PPE_HARDHAT",
        first_observation_ns=1000,
        last_observation_ns=6000,
        persistence_count=6,
        confidence=0.88,
        deduplication_key="cam-ppe:88:PPE:HARDHAT",
    )

    async with get_db_session() as session:
        src_repo = SourceRepository(session)
        await src_repo.create_source("cam-ppe", "PPE Cam", "replay", "video.mp4")
        evt_repo = EventRepository(session)
        await evt_repo.create_from_candidate(candidate)

    async with get_db_session() as session:
        state = await workflow.run(
            event_candidate=candidate,
            correlation_id="corr-timeout-test",
            session=session,
        )

    # Degraded mode was engaged
    assert state.is_degraded_mode is True
    # Deterministic policy STILL safely triggers incident creation
    assert state.policy_result.is_policy_violated is True
    assert state.verification.incident_confirmed is True
    assert state.current_stage == "COMPLETED"


@pytest.mark.asyncio
async def test_agent_non_violation_zone_exit():
    provider = DeterministicMockProvider()
    workflow = SafetyAgentWorkflow(provider)

    # ZONE_EXIT is informational, not a violation
    candidate = SafetyEventCandidate(
        event_id="evt_exit_01",
        event_type=EventType.ZONE_EXIT,
        severity=EventSeverity.INFO,
        source_id="cam-exit",
        track_id=12,
        zone_id="zone-crane",
        rule_id="RULE_CRANE",
        first_observation_ns=1000,
        last_observation_ns=2000,
        persistence_count=5,
        confidence=0.9,
        deduplication_key="cam-exit:12:ZONE_EXIT",
    )

    async with get_db_session() as session:
        src_repo = SourceRepository(session)
        await src_repo.create_source("cam-exit", "Exit Cam", "replay", "video.mp4")
        evt_repo = EventRepository(session)
        await evt_repo.create_from_candidate(candidate)

    async with get_db_session() as session:
        state = await workflow.run(
            event_candidate=candidate,
            correlation_id="corr-exit-test",
            session=session,
        )

    assert state.policy_result.is_policy_violated is False
    assert state.policy_result.recommended_action == "LOG_ONLY"
    # No actions were requested
    assert len(state.action_requests) == 0


@pytest.mark.asyncio
async def test_ollama_local_integration():
    """Live integration with local Ollama if available."""
    # Test if Ollama is accessible
    ollama_online = False
    try:
        async with AsyncClient(timeout=1.5) as client:
            resp = await client.get("http://localhost:11434/api/tags")
            if resp.status_code == 200:
                ollama_online = True
    except Exception:
        ollama_online = False

    if not ollama_online:
        pytest.skip("Local Ollama not running at http://localhost:11434")

    provider = OllamaProvider(model="llama3.2:3b", timeout=10.0)
    workflow = SafetyAgentWorkflow(provider)

    candidate = SafetyEventCandidate(
        event_id="evt_ollama_01",
        event_type=EventType.ZONE_ENTRY,
        severity=EventSeverity.HIGH,
        source_id="cam-live",
        track_id=77,
        zone_id="zone-welding-robot",
        rule_id="RULE_WELDING_BAY",
        first_observation_ns=1000,
        last_observation_ns=3000,
        persistence_count=5,
        confidence=0.94,
        deduplication_key="cam-live:77:ZONE_ENTRY",
    )

    async with get_db_session() as session:
        src_repo = SourceRepository(session)
        await src_repo.create_source("cam-live", "Live Cam", "replay", "video.mp4")
        evt_repo = EventRepository(session)
        await evt_repo.create_from_candidate(candidate)

    async with get_db_session() as session:
        state = await workflow.run(
            event_candidate=candidate,
            correlation_id="corr-ollama-live",
            session=session,
        )

    assert state.investigation is not None
    assert len(state.investigation.summary) > 0
    assert state.policy_result.is_policy_violated is True
    assert state.verification.is_verified is True
