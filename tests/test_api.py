"""
Integration tests for FastAPI REST API endpoints using httpx AsyncClient.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from sentinel.api.app import app
from sentinel.db.repositories.event_repo import EventRepository
from sentinel.db.repositories.incident_repo import IncidentRepository
from sentinel.db.repositories.source_repo import SourceRepository
from sentinel.db.session import get_db_session, init_db
from sentinel.rules.types import EventSeverity, EventType, SafetyEventCandidate


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.mark.asyncio
async def test_health_endpoints():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Liveness
        res_live = await client.get("/health/live")
        assert res_live.status_code == 200
        assert res_live.json()["status"] == "live"

        # Readiness
        res_ready = await client.get("/health/ready")
        assert res_ready.status_code == 200
        assert res_ready.json()["database_connected"] is True


@pytest.mark.asyncio
async def test_sources_api_lifecycle():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Create source
        payload = {
            "source_id": "cam-gate-01",
            "name": "Factory Entrance Gate",
            "source_type": "replay",
            "uri": "data/fixtures/synthetic_safety_video.mp4",
            "fps": 25.0,
        }
        res_create = await client.post("/api/v1/sources", json=payload)
        assert res_create.status_code == 201
        data = res_create.json()
        assert data["id"] == "cam-gate-01"
        assert data["status"] == "CREATED"

        # 2. List sources
        res_list = await client.get("/api/v1/sources")
        assert res_list.status_code == 200
        items = res_list.json()
        assert any(s["id"] == "cam-gate-01" for s in items)

        # 3. Start source
        res_start = await client.post("/api/v1/sources/cam-gate-01/start")
        assert res_start.status_code == 200
        assert res_start.json()["status"] == "RUNNING"

        # 4. Stop source
        res_stop = await client.post("/api/v1/sources/cam-gate-01/stop")
        assert res_stop.status_code == 200
        assert res_stop.json()["status"] == "STOPPED"


@pytest.mark.asyncio
async def test_events_and_incident_review():
    # Setup test event and incident in DB
    async with get_db_session() as session:
        src_repo = SourceRepository(session)
        await src_repo.create_source("cam-zone", "Zone Cam", "replay", "video.mp4")

        evt_repo = EventRepository(session)
        cand = SafetyEventCandidate(
            event_id="evt_api_01",
            event_type=EventType.ZONE_ENTRY,
            severity=EventSeverity.HIGH,
            source_id="cam-zone",
            track_id=12,
            rule_id="RULE_TEST",
            first_observation_ns=1000,
            last_observation_ns=2000,
            persistence_count=5,
            confidence=0.91,
            deduplication_key="cam-zone:12:ZONE_ENTRY",
        )
        await evt_repo.create_from_candidate(cand)

        inc_repo = IncidentRepository(session)
        await inc_repo.create_incident("inc_api_01", "evt_api_01", "Worker In Danger Zone", "HIGH")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Get Event
        res_evt = await client.get("/api/v1/events/evt_api_01")
        assert res_evt.status_code == 200
        assert res_evt.json()["track_id"] == 12

        # 404 for missing event
        res_404 = await client.get("/api/v1/events/missing_evt")
        assert res_404.status_code == 404

        # List Incidents
        res_inc_list = await client.get("/api/v1/incidents?status=OPEN")
        assert res_inc_list.status_code == 200
        incidents = res_inc_list.json()
        assert any(i["id"] == "inc_api_01" for i in incidents)

        # Review Incident
        review_payload = {
            "action": "RESOLVE",
            "reviewer_name": "Safety Lead Sarah",
            "notes": "Verified worker left area safely.",
        }
        res_review = await client.post("/api/v1/incidents/inc_api_01/review", json=review_payload)
        assert res_review.status_code == 200
        assert res_review.json()["status"] == "RESOLVED"
        assert res_review.json()["assigned_to"] == "Safety Lead Sarah"


@pytest.mark.asyncio
async def test_analytics_and_correlation_headers():
    headers = {"X-Correlation-ID": "test-custom-cid-12345"}
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test", headers=headers
    ) as client:
        # Summary
        res_summary = await client.get("/api/v1/analytics/summary")
        assert res_summary.status_code == 200
        data = res_summary.json()
        assert "total_sources" in data
        assert "total_events" in data

        # Vision analytics
        res_vision = await client.get("/api/v1/analytics/vision")
        assert res_vision.status_code == 200
        v_data = res_vision.json()
        assert v_data["effective_fps"] > 0

        # Check correlation ID header echoed back
        assert res_vision.headers.get("X-Correlation-ID") == "test-custom-cid-12345"
        assert "X-Process-Time-Ms" in res_vision.headers


@pytest.mark.asyncio
async def test_agent_api_endpoints(monkeypatch):
    monkeypatch.setenv("ENABLE_MOCK_LLM", "true")

    # Seed an event
    async with get_db_session() as session:
        src_repo = SourceRepository(session)
        await src_repo.create_source("cam-agent-api", "Agent Cam", "replay", "uri")

        evt_repo = EventRepository(session)
        cand = SafetyEventCandidate(
            event_id="evt_agent_api_99",
            event_type=EventType.ZONE_ENTRY,
            severity=EventSeverity.CRITICAL,
            source_id="cam-agent-api",
            track_id=99,
            rule_id="RULE_TEST_AGENT",
            first_observation_ns=1000,
            last_observation_ns=2000,
            persistence_count=5,
            confidence=0.98,
            deduplication_key="cam-agent-api:99:ZONE_ENTRY",
        )
        await evt_repo.create_from_candidate(cand)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Trigger agent investigation
        res_inv = await client.post("/api/v1/agents/investigate/evt_agent_api_99")
        assert res_inv.status_code == 200
        inv_data = res_inv.json()
        assert inv_data["status"] == "COMPLETED"
        assert inv_data["policy_result"]["is_policy_violated"] is True
        assert inv_data["verification"]["is_verified"] is True
