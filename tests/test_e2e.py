"""
SENTINEL AI — End-to-End Integration Test Suite.
Validates the complete industrial safety lifecycle from recorded video ingestion
through YOLO inference, multi-object tracking, temporal spatial rules,
4-stage stateful agent orchestration, policy gating, allowlisted tool execution,
and database persistence.

Separates normal real-inference verification (zero detections creates no incidents)
from explicit demo-fixture simulation mode (DEF-03).
"""

from pathlib import Path

import pytest
from sqlalchemy import select

from sentinel.agents.providers.mock import DeterministicMockProvider
from sentinel.agents.workflow import SafetyAgentWorkflow
from sentinel.db.models import (
    IncidentModel,
    NotificationModel,
    SafetyEventModel,
    VideoSourceModel,
)
from sentinel.db.session import get_session_factory, reset_db
from sentinel.rules.temporal_engine import TemporalEventEngine
from sentinel.rules.types import EventSeverity, EventType, SafetyEventCandidate
from sentinel.rules.zones import RestrictedZone, ZoneManager, ZoneType
from sentinel.vision.adapter import YOLOAdapter
from sentinel.vision.sources.replay import VideoReplaySource
from sentinel.vision.tracking import MultiObjectTracker


@pytest.fixture(autouse=True)
async def setup_isolated_db():
    """Sets up a clean isolated test database schema for each e2e test run."""
    await reset_db()
    yield
    await reset_db()


@pytest.mark.asyncio
async def test_normal_inference_zero_detection_creates_no_fabricated_incident():
    """
    DEF-03 Fix Verification:
    Normal real-world YOLO inference over the cartoon video fixture produces 0 human detections.
    The system MUST honestly report zero detections and NEVER inject a fake or fallback incident.
    """
    repo_root = Path(__file__).resolve().parent.parent
    video_path = repo_root / "data" / "fixtures" / "synthetic_safety_video.mp4"
    assert video_path.exists(), f"Synthetic video fixture not found at {video_path}"

    # 1. Initialize Vision Stack
    adapter = YOLOAdapter(model_path="yolov8n.pt", device="cpu", confidence_threshold=0.35)
    tracker = MultiObjectTracker(iou_threshold=0.25, max_lost_frames=15)

    # 2. Configure OSHA Safety Zone A-1
    zone_mgr = ZoneManager()
    zone = RestrictedZone(
        zone_id="zone-crane-a1",
        name="Overhead Crane Danger Zone A-1",
        polygon_points=[(0.36, 0.24), (0.58, 0.24), (0.58, 0.44), (0.36, 0.44)],
        zone_type=ZoneType.RESTRICTED,
        severity=EventSeverity.CRITICAL,
    )
    zone_mgr.add_zone(zone)
    temporal_engine = TemporalEventEngine(zone_manager=zone_mgr, persistence_threshold=5)

    # 3. Stream Recorded Video Fixture
    source = VideoReplaySource(
        source_id="test-cam-real",
        video_path=video_path,
        loop=False,
    )
    source.start()

    emitted_events: list[SafetyEventCandidate] = []
    frame_count = 0
    total_detections = 0

    while True:
        frame = source.read_frame()
        if frame is None:
            break
        frame_count += 1

        inf_result = adapter.infer(frame.data, frame_id=frame.frame_id)
        total_detections += len(inf_result.detections)
        tracker.update(inf_result.detections, frame_id=frame.frame_id)
        active_tracks = tracker.get_active_tracks()

        events = temporal_engine.process_frame(
            tracked_entities=active_tracks,
            timestamp_ns=frame.timestamp_ns,
            source_id=source.source_id,
        )
        emitted_events.extend(events)

    source.stop()
    assert frame_count == 125, f"Expected 125 frames, processed {frame_count}"

    # Real COCO person detector does not recognize synthetic cartoon figures:
    assert total_detections == 0, f"Expected 0 COCO detections on synthetic cartoon, found {total_detections}"

    # Must honestly produce 0 events, with ZERO silent fallback injections:
    assert len(emitted_events) == 0, "Normal inference must NOT inject fabricated incidents when detections are zero"


@pytest.mark.asyncio
async def test_explicit_demo_fixture_mode_with_simulation_marker():
    """
    Validates that explicitly requested demo-fixture mode executes the complete
    4-stage multi-agent orchestration while clearly stamping simulation markers on records.
    """
    repo_root = Path(__file__).resolve().parent.parent
    video_path = repo_root / "data" / "fixtures" / "synthetic_safety_video.mp4"

    # Create an explicitly marked SIMULATION candidate
    simulated_event = SafetyEventCandidate(
        event_id="evt_simulated_demo_01",
        event_type=EventType.ZONE_ENTRY,
        severity=EventSeverity.CRITICAL,
        source_id="test-cam-sim",
        track_id=42,
        zone_id="zone-crane-a1",
        rule_id="RULE_OSHA_ZONE_001",
        first_observation_ns=1_000_000_000,
        last_observation_ns=1_200_000_000,
        persistence_count=5,
        confidence=0.95,
        deduplication_key="dedup-sim-demo-01",
        supporting_detections=[],
        metadata={
            "is_simulated": True,
            "simulation_mode": "demo_fixture",
            "zone_name": "Overhead Crane Danger Zone A-1",
        },
    )

    # 4-Stage Stateful Agent Orchestration
    session_factory = get_session_factory()
    provider = DeterministicMockProvider()
    workflow = SafetyAgentWorkflow(provider=provider)

    async with session_factory() as session:
        # Pre-record VideoSource
        source_record = VideoSourceModel(
            id=simulated_event.source_id,
            name="Simulated Demo Camera",
            source_type="replay",
            uri=str(video_path),
            status="RUNNING",
        )
        session.add(source_record)
        await session.flush()

        # Pre-record Event in database with explicit simulation metadata
        event_record = SafetyEventModel(
            id=simulated_event.event_id,
            source_id=simulated_event.source_id,
            event_type=simulated_event.event_type.value,
            severity=simulated_event.severity.value,
            track_id=simulated_event.track_id,
            zone_id=simulated_event.zone_id,
            rule_id=simulated_event.rule_id,
            first_observation_ns=simulated_event.first_observation_ns,
            last_observation_ns=simulated_event.last_observation_ns,
            persistence_count=simulated_event.persistence_count,
            confidence=simulated_event.confidence,
            deduplication_key=simulated_event.deduplication_key,
            meta_json=simulated_event.metadata,
        )
        session.add(event_record)
        await session.flush()

        # Run Multi-Agent Workflow
        agent_state = await workflow.run(
            event_candidate=simulated_event,
            correlation_id="corr-demo-sim-42",
            session=session,
        )
        await session.commit()

    # Verify Workflow Outcomes
    assert agent_state.current_stage == "COMPLETED"
    assert agent_state.investigation is not None
    assert agent_state.policy_result is not None
    assert agent_state.policy_result.is_policy_violated is True
    assert agent_state.verification is not None
    assert agent_state.verification.is_verified is True
    assert agent_state.verification.incident_confirmed is True

    # Verify Database Side-Effects (Incident & Notification creation)
    async with session_factory() as session:
        stmt_inc = select(IncidentModel).where(IncidentModel.event_id == simulated_event.event_id)
        res_inc = await session.execute(stmt_inc)
        incident = res_inc.scalar_one_or_none()
        assert incident is not None
        assert incident.status == "OPEN"
        assert incident.severity == simulated_event.severity.value

        stmt_notif = select(NotificationModel).where(NotificationModel.incident_id == incident.id)
        res_notif = await session.execute(stmt_notif)
        notif = res_notif.scalar_one_or_none()
        assert notif is not None
        assert notif.status == "SENT"
        assert notif.recipient == "plant_supervisor"
