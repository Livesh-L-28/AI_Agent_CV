"""
Integration tests for SQLAlchemy models, repositories, and transaction management.
"""

from pathlib import Path

import pytest

from sentinel.db.repositories.audit_repo import AuditRepository
from sentinel.db.repositories.event_repo import EventRepository
from sentinel.db.repositories.evidence_repo import EvidenceRepository
from sentinel.db.repositories.incident_repo import IncidentRepository
from sentinel.db.repositories.source_repo import SourceRepository
from sentinel.db.session import get_db_session, init_db
from sentinel.rules.types import EventSeverity, EventType, SafetyEventCandidate


@pytest.fixture(autouse=True)
async def setup_test_database():
    """Initializes tables for each test."""
    await init_db()


@pytest.mark.asyncio
async def test_source_repository():
    async with get_db_session() as session:
        repo = SourceRepository(session)
        source = await repo.create_source(
            source_id="cam-bay-01",
            name="Robotic Bay Camera",
            source_type="replay",
            uri="data/fixtures/synthetic_safety_video.mp4",
            status="RUNNING",
            fps=30.0,
        )
        assert source.id == "cam-bay-01"
        assert source.fps == 30.0

    async with get_db_session() as session:
        repo = SourceRepository(session)
        loaded = await repo.get_by_id("cam-bay-01")
        assert loaded is not None
        assert loaded.name == "Robotic Bay Camera"

        # Update status
        await repo.update_status("cam-bay-01", "STOPPED")

    async with get_db_session() as session:
        repo = SourceRepository(session)
        updated = await repo.get_by_id("cam-bay-01")
        assert updated.status == "STOPPED"


@pytest.mark.asyncio
async def test_event_and_incident_lifecycle():
    async with get_db_session() as session:
        # 1. Create source
        src_repo = SourceRepository(session)
        await src_repo.create_source("cam-02", "Zone Camera", "replay", "video.mp4")

        # 2. Persist event candidate
        event_repo = EventRepository(session)
        candidate = SafetyEventCandidate(
            event_id="evt_test_100",
            event_type=EventType.ZONE_ENTRY,
            severity=EventSeverity.CRITICAL,
            source_id="cam-02",
            track_id=42,
            zone_id="zone-crane",
            rule_id="RULE_ZONE_CRANE",
            first_observation_ns=1000,
            last_observation_ns=5000,
            persistence_count=5,
            confidence=0.95,
            deduplication_key="cam-02:42:zone-crane:ZONE_ENTRY",
            metadata={"operator": "autonomous"},
        )
        db_event = await event_repo.create_from_candidate(candidate)
        assert db_event.id == "evt_test_100"

        # 3. Create incident linked to event
        inc_repo = IncidentRepository(session)
        incident = await inc_repo.create_incident(
            incident_id="inc_200",
            event_id="evt_test_100",
            title="Unauthorized Worker In Crane Zone",
            severity="CRITICAL",
            status="OPEN",
        )
        assert incident.id == "inc_200"

    # Query in fresh session
    async with get_db_session() as session:
        inc_repo = IncidentRepository(session)
        inc = await inc_repo.get_by_id("inc_200")
        assert inc is not None
        assert inc.severity == "CRITICAL"
        assert inc.status == "OPEN"

        # Resolve incident
        await inc_repo.update_status(
            "inc_200",
            status="RESOLVED",
            assigned_to="Supervisor Dan",
            resolution_notes="Worker safely escorted out",
        )

    async with get_db_session() as session:
        inc_repo = IncidentRepository(session)
        resolved = await inc_repo.get_by_id("inc_200")
        assert resolved.status == "RESOLVED"
        assert resolved.assigned_to == "Supervisor Dan"


@pytest.mark.asyncio
async def test_evidence_asset_hashing(tmp_path: Path):
    # Create sample evidence image file
    sample_file = tmp_path / "evidence_sample.jpg"
    sample_file.write_bytes(b"Simulated JPEG raw frame content bytes 12345")

    async with get_db_session() as session:
        repo = EvidenceRepository(session)
        asset = await repo.register_asset(
            asset_id="asset_01",
            file_path=sample_file,
            asset_type="FRAME",
            incident_id=None,
        )
        assert asset.id == "asset_01"
        assert len(asset.sha256_hash) == 64
        assert asset.byte_size == len(sample_file.read_bytes())


@pytest.mark.asyncio
async def test_audit_repository():
    async with get_db_session() as session:
        audit_repo = AuditRepository(session)
        log = await audit_repo.log_action(
            correlation_id="corr-9988",
            actor="Agent-Investigator",
            action="EVALUATE_ZONE_EVIDENCE",
            resource_type="SAFETY_EVENT",
            resource_id="evt_test_100",
            outcome="SUCCESS",
            details={"confidence": 0.95},
        )
        assert log.id is not None
        assert log.correlation_id == "corr-9988"

    async with get_db_session() as session:
        audit_repo = AuditRepository(session)
        logs = await audit_repo.list_logs(correlation_id="corr-9988")
        assert len(logs) == 1
        assert logs[0].action == "EVALUATE_ZONE_EVIDENCE"


@pytest.mark.asyncio
async def test_transaction_rollback():
    # Verify rollback prevents partial writes on unhandled exception
    with pytest.raises(RuntimeError):
        async with get_db_session() as session:
            repo = SourceRepository(session)
            await repo.create_source("cam-fail", "Should be rolled back", "replay", "uri")
            raise RuntimeError("Forced simulation error")

    async with get_db_session() as session:
        repo = SourceRepository(session)
        source = await repo.get_by_id("cam-fail")
        assert source is None, "Failed transaction was not properly rolled back!"
