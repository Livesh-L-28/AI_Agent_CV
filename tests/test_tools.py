"""
Unit and security tests for sentinel.agents.tools (allowlisting, authorization, idempotency).
"""

import pytest

from sentinel.agents.tools import execute_tool
from sentinel.db.repositories.event_repo import EventRepository
from sentinel.db.repositories.source_repo import SourceRepository
from sentinel.db.session import get_db_session, init_db
from sentinel.rules.types import EventSeverity, EventType, SafetyEventCandidate


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.mark.asyncio
async def test_unauthorized_tool_rejection():
    async with get_db_session() as session:
        # Attempt to run arbitrary shell or unauthorized tool
        result = await execute_tool(
            session=session,
            tool_name="execute_shell_command",
            parameters={"command": "rm -rf /"},
            idempotency_key="idemp_shell_1",
        )
        assert result.status == "REJECTED_UNAUTHORIZED"
        assert "not in the authorized Sentinel AI allowlist" in result.error


@pytest.mark.asyncio
async def test_create_incident_and_idempotency():
    async with get_db_session() as session:
        src_repo = SourceRepository(session)
        await src_repo.create_source("cam-sec-1", "Security Cam", "replay", "uri")

        evt_repo = EventRepository(session)
        cand = SafetyEventCandidate(
            event_id="evt_tool_01",
            event_type=EventType.ZONE_ENTRY,
            severity=EventSeverity.CRITICAL,
            source_id="cam-sec-1",
            track_id=55,
            rule_id="RULE_SEC",
            first_observation_ns=1000,
            last_observation_ns=2000,
            persistence_count=5,
            confidence=0.99,
            deduplication_key="cam-sec-1:55:ZONE_ENTRY",
        )
        await evt_repo.create_from_candidate(cand)

        # 1. First execution
        res1 = await execute_tool(
            session=session,
            tool_name="create_incident",
            parameters={
                "incident_id": "inc_tool_01",
                "event_id": "evt_tool_01",
                "title": "Critical Perimeter Breach",
                "severity": "CRITICAL",
            },
            idempotency_key="idemp_inc_01",
        )
        assert res1.status == "SUCCESS"
        assert res1.output["already_existed"] is False

        # 2. Second execution with same parameters (idempotent)
        res2 = await execute_tool(
            session=session,
            tool_name="create_incident",
            parameters={
                "incident_id": "inc_tool_01",
                "event_id": "evt_tool_01",
                "title": "Critical Perimeter Breach",
                "severity": "CRITICAL",
            },
            idempotency_key="idemp_inc_01",
        )
        assert res2.status == "SUCCESS"
        assert res2.output["already_existed"] is True


@pytest.mark.asyncio
async def test_send_alert_duplicate_prevention():
    async with get_db_session() as session:
        src_repo = SourceRepository(session)
        await src_repo.create_source("cam-sec-2", "Security Cam", "replay", "uri")

        evt_repo = EventRepository(session)
        cand = SafetyEventCandidate(
            event_id="evt_tool_02",
            event_type=EventType.ZONE_ENTRY,
            severity=EventSeverity.HIGH,
            source_id="cam-sec-2",
            track_id=56,
            rule_id="RULE_SEC",
            first_observation_ns=1000,
            last_observation_ns=2000,
            persistence_count=5,
            confidence=0.90,
            deduplication_key="cam-sec-2:56:ZONE_ENTRY",
        )
        await evt_repo.create_from_candidate(cand)

        # Create prerequisite incident
        await execute_tool(
            session=session,
            tool_name="create_incident",
            parameters={
                "incident_id": "inc_tool_02",
                "event_id": "evt_tool_02",
                "title": "High Alert",
                "severity": "HIGH",
            },
            idempotency_key="idemp_inc_02",
        )

        # 1. Send first alert
        idemp_alert = "idemp_alert_unique_key_999"
        alert_res1 = await execute_tool(
            session=session,
            tool_name="send_supervisor_alert",
            parameters={
                "incident_id": "inc_tool_02",
                "channel": "MOCK_CONSOLE",
                "recipient": "plant_manager",
                "message": "Immediate attention required",
            },
            idempotency_key=idemp_alert,
        )
        assert alert_res1.status == "SUCCESS"
        assert alert_res1.output["duplicate_prevented"] is False

        # 2. Second alert with same idempotency key must be prevented from duplicate dispatch
        alert_res2 = await execute_tool(
            session=session,
            tool_name="send_supervisor_alert",
            parameters={
                "incident_id": "inc_tool_02",
                "channel": "MOCK_CONSOLE",
                "recipient": "plant_manager",
                "message": "Immediate attention required",
            },
            idempotency_key=idemp_alert,
        )
        assert alert_res2.status == "SUCCESS"
        assert alert_res2.output["duplicate_prevented"] is True
