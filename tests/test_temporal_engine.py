"""
Unit, temporal persistence, occlusion grace, and timestamp regression tests
for sentinel.rules.temporal_engine (DEF-04 and DEF-05).
"""

from sentinel.rules.temporal_engine import TemporalEventEngine
from sentinel.rules.types import EventSeverity, EventType
from sentinel.rules.zones import RestrictedZone, ZoneManager, ZoneType
from sentinel.vision.tracking import TrackedEntity, TrackState
from sentinel.vision.types import BoundingBox


def create_mock_worker(track_id: int, ground_x: float, ground_y: float) -> TrackedEntity:
    """Helper creating a TrackedEntity with specified ground contact point."""
    x1 = max(0.0, ground_x - 0.05)
    y1 = max(0.0, ground_y - 0.2)
    x2 = min(1.0, ground_x + 0.05)
    y2 = min(1.0, ground_y)
    return TrackedEntity(
        track_id=track_id,
        class_id=0,
        class_name="person",
        current_bbox=BoundingBox(
            x1=x1,
            y1=y1,
            x2=x2,
            y2=y2,
        ),
        ground_point=(ground_x, ground_y),
        confidence=0.92,
        state=TrackState.ACTIVE,
        first_frame_id=1,
        last_frame_id=1,
        hits=5,
        time_since_update=0,
    )


def test_persistence_threshold_and_entry_event():
    zone = RestrictedZone(
        zone_id="zone-crane",
        name="Overhead Crane Danger Zone",
        polygon_points=[(0.4, 0.4), (0.8, 0.4), (0.8, 0.8), (0.4, 0.8)],
        zone_type=ZoneType.RESTRICTED,
        severity=EventSeverity.CRITICAL,
    )
    engine = TemporalEventEngine(
        zone_manager=ZoneManager([zone]),
        persistence_threshold=5,
        exit_threshold=3,
    )

    source_id = "cam-factory-1"
    base_time = 1_000_000_000_000

    # Frames 1 to 4: Worker is inside zone at (0.5, 0.5)
    for frame_id in range(1, 5):
        worker = create_mock_worker(track_id=101, ground_x=0.5, ground_y=0.5)
        events = engine.process_frame(
            tracked_entities=[worker],
            timestamp_ns=base_time + (frame_id * 40_000_000),  # 25 fps
            source_id=source_id,
        )
        assert len(events) == 0, f"Event emitted prematurely at frame {frame_id}"

    # Frame 5: Persistence threshold (5) is reached -> Emit ZONE_ENTRY
    worker = create_mock_worker(track_id=101, ground_x=0.5, ground_y=0.5)
    events_frame_5 = engine.process_frame(
        tracked_entities=[worker],
        timestamp_ns=base_time + (5 * 40_000_000),
        source_id=source_id,
    )
    assert len(events_frame_5) == 1
    event = events_frame_5[0]
    assert event.event_type == EventType.ZONE_ENTRY
    assert event.severity == EventSeverity.CRITICAL
    assert event.track_id == 101
    assert event.zone_id == "zone-crane"
    assert event.persistence_count == 5
    assert len(event.supporting_detections) == 5

    # Frames 6 to 10: Worker still inside zone -> Cooldown prevents duplicate ZONE_ENTRY
    for frame_id in range(6, 11):
        worker = create_mock_worker(track_id=101, ground_x=0.5, ground_y=0.5)
        subsequent_events = engine.process_frame(
            tracked_entities=[worker],
            timestamp_ns=base_time + (frame_id * 40_000_000),
            source_id=source_id,
        )
        assert len(subsequent_events) == 0, f"Duplicate event emitted at frame {frame_id}"


def test_timestamp_aware_persistence_variable_fps():
    """Verifies that persistence honors elapsed wall-clock duration in addition to frame count."""
    zone = RestrictedZone(
        zone_id="zone-highspeed",
        name="High Speed Zone",
        polygon_points=[(0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9)],
    )
    # Require BOTH 5 frames AND 200 ms (200,000,000 ns) of elapsed time
    engine = TemporalEventEngine(
        zone_manager=ZoneManager([zone]),
        persistence_threshold=5,
        persistence_duration_ns=200_000_000,
    )
    source_id = "cam-60fps"
    base_time = 1_000_000_000_000

    # At 100 FPS (10 ms per frame):
    # Frames 1..5 span 0ms, 10ms, 20ms, 30ms, 40ms -> Only 40ms elapsed!
    for f in range(1, 6):
        w = create_mock_worker(track_id=505, ground_x=0.5, ground_y=0.5)
        events = engine.process_frame(
            [w], timestamp_ns=base_time + (f * 10_000_000), source_id=source_id
        )
        # Even though 5 frames reached, duration (40ms < 200ms) is not satisfied yet!
        assert len(events) == 0, f"Premature event at frame {f} (elapsed duration too short)"

    # Fast forward to 210 ms (Frame 21) -> Duration satisfied, emit ZONE_ENTRY
    w_21 = create_mock_worker(track_id=505, ground_x=0.5, ground_y=0.5)
    events_21 = engine.process_frame(
        [w_21], timestamp_ns=base_time + 210_000_000, source_id=source_id
    )
    assert len(events_21) == 1
    assert events_21[0].event_type == EventType.ZONE_ENTRY


def test_brief_occlusion_and_track_reacquisition():
    """
    DEF-05 Fix Verification:
    A worker in an active violation is temporarily occluded for 2 frames.
    The active violation must NOT be closed, and upon reacquisition,
    NO duplicate entry incident is emitted.
    """
    zone = RestrictedZone(
        zone_id="zone-crane-occ",
        name="Crane Zone",
        polygon_points=[(0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)],
    )
    # 3 frames grace period
    engine = TemporalEventEngine(
        zone_manager=ZoneManager([zone]),
        persistence_threshold=3,
        track_loss_grace_frames=3,
    )
    source_id = "cam-occ"
    base_time = 1_000_000_000

    # 1. Trigger active violation (Frames 1-3)
    for f in range(1, 4):
        w = create_mock_worker(track_id=77, ground_x=0.5, ground_y=0.5)
        events = engine.process_frame([w], timestamp_ns=base_time + (f * 40_000_000), source_id=source_id)

    assert len(events) == 1
    assert events[0].event_type == EventType.ZONE_ENTRY

    # 2. Frame 4 & 5: Worker occluded behind pillar (empty detection list)
    # Violation MUST remain active within grace period
    e4 = engine.process_frame([], timestamp_ns=base_time + (4 * 40_000_000), source_id=source_id)
    assert len(e4) == 0, "Violation should NOT be auto-closed during brief occlusion"

    e5 = engine.process_frame([], timestamp_ns=base_time + (5 * 40_000_000), source_id=source_id)
    assert len(e5) == 0, "Violation should NOT be auto-closed during brief occlusion"

    # 3. Frame 6: Worker reacquired with same track ID!
    # Engine must NOT emit duplicate entry event; state is preserved
    w_reacq = create_mock_worker(track_id=77, ground_x=0.5, ground_y=0.5)
    e6 = engine.process_frame([w_reacq], timestamp_ns=base_time + (6 * 40_000_000), source_id=source_id)
    assert len(e6) == 0, "Reacquired track should NOT trigger duplicate ZONE_ENTRY"

    # 4. Worker steps outside (Frames 7, 8, 9) -> Confirmed exit
    w_out = create_mock_worker(track_id=77, ground_x=0.1, ground_y=0.1)
    engine.process_frame([w_out], timestamp_ns=base_time + (7 * 40_000_000), source_id=source_id)
    engine.process_frame([w_out], timestamp_ns=base_time + (8 * 40_000_000), source_id=source_id)
    e9 = engine.process_frame([w_out], timestamp_ns=base_time + (9 * 40_000_000), source_id=source_id)
    assert len(e9) == 1
    assert e9[0].event_type == EventType.ZONE_EXIT
    assert e9[0].metadata["closure_reason"] == "confirmed_exit"


def test_long_track_loss_closure():
    """When a track remains missing beyond the grace period, it is closed with track_lost."""
    zone = RestrictedZone(
        zone_id="zone-chem",
        name="Chemical Tank",
        polygon_points=[(0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)],
    )
    engine = TemporalEventEngine(
        zone_manager=ZoneManager([zone]),
        persistence_threshold=2,
        track_loss_grace_frames=2,
    )
    source_id = "cam-chem"

    # Frame 1 & 2: Trigger violation
    w = create_mock_worker(track_id=303, ground_x=0.5, ground_y=0.5)
    engine.process_frame([w], timestamp_ns=1000, source_id=source_id)
    events = engine.process_frame([w], timestamp_ns=2000, source_id=source_id)
    assert len(events) == 1

    # Frame 3 (missing frame 1 <= grace 2) -> No exit
    e3 = engine.process_frame([], timestamp_ns=3000, source_id=source_id)
    assert len(e3) == 0

    # Frame 4 (missing frame 2 <= grace 2) -> No exit
    e4 = engine.process_frame([], timestamp_ns=4000, source_id=source_id)
    assert len(e4) == 0

    # Frame 5 (missing frame 3 > grace 2) -> Grace exceeded, emits ZONE_EXIT
    e5 = engine.process_frame([], timestamp_ns=5000, source_id=source_id)
    assert len(e5) == 1
    assert e5[0].event_type == EventType.ZONE_EXIT
    assert e5[0].metadata["closure_reason"] == "track_lost"


def test_clock_anomaly_and_stale_gap_handling():
    """Tests handling of backwards clock jumps and large stale gaps."""
    zone = RestrictedZone(
        zone_id="zone-clock",
        name="Clock Test Zone",
        polygon_points=[(0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8)],
    )
    engine = TemporalEventEngine(
        zone_manager=ZoneManager([zone]),
        persistence_threshold=3,
        max_observation_gap_ns=1_000_000_000,  # 1 second max gap
    )
    source_id = "cam-clock"

    # Frame 1: inside at t=5000
    w = create_mock_worker(track_id=909, ground_x=0.5, ground_y=0.5)
    engine.process_frame([w], timestamp_ns=5000, source_id=source_id)

    # Frame 2: backwards timestamp (t=4000) -> Must clamp and not crash
    engine.process_frame([w], timestamp_ns=4000, source_id=source_id)

    # Frame 3: huge gap (t=5000 + 10 seconds) -> Exceeds max_observation_gap_ns
    # Streak must reset
    engine.process_frame([w], timestamp_ns=5000 + 10_000_000_000, source_id=source_id)
    state = engine.state_table[(source_id, 909, "zone-clock")]
    assert state.consecutive_inside == 1  # Reset to 1 rather than accumulating to 3


def test_source_shutdown_clean_flush():
    """Tests clean closing of active incidents on source shutdown / video replay completion."""
    zone = RestrictedZone(
        zone_id="zone-flush",
        name="Flush Zone",
        polygon_points=[(0.2, 0.2), (0.8, 0.2), (0.8, 0.8), (0.2, 0.8)],
    )
    engine = TemporalEventEngine(
        zone_manager=ZoneManager([zone]),
        persistence_threshold=2,
    )
    source_id = "cam-flush"

    w = create_mock_worker(track_id=111, ground_x=0.5, ground_y=0.5)
    engine.process_frame([w], timestamp_ns=1000, source_id=source_id)
    events = engine.process_frame([w], timestamp_ns=2000, source_id=source_id)
    assert len(events) == 1
    assert events[0].event_type == EventType.ZONE_ENTRY

    # Shutdown source
    closed_events = engine.close_source(source_id=source_id, timestamp_ns=3000)
    assert len(closed_events) == 1
    assert closed_events[0].event_type == EventType.ZONE_EXIT
    assert closed_events[0].metadata["closure_reason"] == "source_shutdown"
