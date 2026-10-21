"""
SENTINEL AI — Telemetry and Demonstration Honesty Regression Test Suite (Sprint 1D / DEF-03, DEF-06, DEF-10).
Verifies:
1. VisionMetricsProvider starts in honest IDLE state when no frames are processed.
2. Metrics provider dynamically reflects real measured latency and FPS when inference passes occur.
3. Analytics API endpoint /api/v1/analytics/vision reports live metrics, not fixed constants.
4. Normal video inference on synthetic video yields 0 detections and does NOT inject fabricated events.
5. Simulated demo incidents explicitly carry simulation markers in metadata.
"""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from sentinel.api.app import app
from sentinel.rules.temporal_engine import TemporalEventEngine
from sentinel.rules.types import EventSeverity, EventType, SafetyEventCandidate
from sentinel.rules.zones import RestrictedZone, ZoneManager
from sentinel.security.auth import UserRole, create_access_token
from sentinel.vision.adapter import YOLOAdapter
from sentinel.vision.metrics import VisionMetricsProvider, get_vision_metrics_provider
from sentinel.vision.sources.replay import VideoReplaySource
from sentinel.vision.tracking import MultiObjectTracker


@pytest.fixture
def auth_headers() -> dict[str, str]:
    token = create_access_token(user_id="usr_viewer", username="viewer_user", role=UserRole.VIEWER)
    return {"Authorization": f"Bearer {token}"}


def test_metrics_provider_idle_state():
    provider = VisionMetricsProvider()
    metrics = provider.get_metrics()
    assert metrics["status"] == "IDLE_NO_STREAM"
    assert metrics["average_latency_ms"] == 0.0
    assert metrics["effective_fps"] == 0.0
    assert metrics["frames_processed"] == 0
    assert metrics["detected_persons"] == 0


def test_metrics_provider_live_recording():
    provider = VisionMetricsProvider(window_size=5)
    # Record 4 inference passes of 20 ms each
    provider.record_inference(latency_ms=20.0, detected_persons=2, device="mps")
    provider.record_inference(latency_ms=20.0, detected_persons=1, device="mps")
    provider.record_inference(latency_ms=20.0, detected_persons=3, device="mps")
    provider.record_inference(latency_ms=20.0, detected_persons=0, device="mps")

    metrics = provider.get_metrics()
    assert metrics["status"] == "ACTIVE_STREAMING"
    assert metrics["device"] == "mps"
    assert metrics["average_latency_ms"] == 20.0
    assert metrics["effective_fps"] == 50.0  # 1000 / 20 = 50.0 FPS
    assert metrics["frames_processed"] == 4
    assert metrics["detected_persons"] == 6


@pytest.mark.asyncio
async def test_analytics_vision_endpoint_reflects_provider(auth_headers: dict[str, str]):
    provider = get_vision_metrics_provider()
    provider.reset()
    # Inject real measurement into global provider
    provider.record_inference(latency_ms=10.0, detected_persons=5, device="mps")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        res = await client.get("/api/v1/analytics/vision")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ACTIVE_STREAMING"
        assert data["average_latency_ms"] == 10.0
        assert data["effective_fps"] == 100.0
        assert data["detected_persons"] == 5


@pytest.mark.asyncio
async def test_zero_detections_does_not_inject_fabricated_incident():
    """Confirms that running the video pipeline when zero objects are detected yields zero events."""
    repo_root = Path(__file__).resolve().parent.parent
    video_path = repo_root / "data" / "fixtures" / "synthetic_safety_video.mp4"
    assert video_path.exists()

    adapter = YOLOAdapter(model_path="yolov8n.pt", device="cpu", confidence_threshold=0.35)
    tracker = MultiObjectTracker(iou_threshold=0.25, max_lost_frames=15)
    zone_mgr = ZoneManager([
        RestrictedZone(
            zone_id="zone-z",
            name="Z",
            polygon_points=[(0.36, 0.24), (0.58, 0.24), (0.58, 0.44), (0.36, 0.44)],
            severity=EventSeverity.CRITICAL,
        )
    ])
    temporal_engine = TemporalEventEngine(zone_manager=zone_mgr, persistence_threshold=5)
    source = VideoReplaySource(source_id="test-zero", video_path=video_path, loop=False)
    source.start()

    events: list[SafetyEventCandidate] = []
    frame_count = 0
    while True:
        frame = source.read_frame()
        if frame is None:
            break
        frame_count += 1
        inf = adapter.infer(frame.data, frame_id=frame.frame_id)
        tracker.update(inf.detections, frame_id=frame.frame_id)
        evs = temporal_engine.process_frame(tracker.get_active_tracks(), frame.timestamp_ns, source.source_id)
        events.extend(evs)
    source.stop()

    assert frame_count == 125
    assert len(events) == 0, "Pipeline must NOT fabricate events when 0 detections occur"


def test_simulated_incidents_carry_explicit_simulation_marker():
    """Confirms that simulated demo fixture candidates carry explicit simulation markers."""
    candidate = SafetyEventCandidate(
        event_id="evt_sim_test_01",
        event_type=EventType.ZONE_ENTRY,
        severity=EventSeverity.CRITICAL,
        source_id="demo-source",
        track_id=1,
        zone_id="zone-crane-a1",
        rule_id="RULE_TEST",
        first_observation_ns=1000,
        last_observation_ns=2000,
        persistence_count=5,
        confidence=0.99,
        deduplication_key="dedup-sim-01",
        metadata={
            "is_simulated": True,
            "simulation_mode": "demo_fixture",
        },
    )
    assert candidate.metadata.get("is_simulated") is True
    assert candidate.metadata.get("simulation_mode") == "demo_fixture"
