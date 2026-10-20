"""
Unit and temporal persistence tests for sentinel.rules.temporal_engine
"""

import time

from sentinel.rules.temporal_engine import TemporalEventEngine
from sentinel.rules.types import EventSeverity, EventType
from sentinel.rules.zones import RestrictedZone, ZoneManager, ZoneType
from sentinel.vision.tracking import TrackedEntity, TrackState
from sentinel.vision.types import BoundingBox


def create_mock_worker(track_id: int, ground_x: float, ground_y: float) -> TrackedEntity:
    # Worker bbox where ground contact point ((x1+x2)/2, y2) equals (ground_x, ground_y)
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
    # Zone spanning [0.4, 0.4] to [0.8, 0.8]
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
    base_time = time.time_ns()

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


def test_zone_exit_event():
    zone = RestrictedZone(
        zone_id="zone-welding",
        name="Robotic Welding Bay",
        polygon_points=[(0.2, 0.2), (0.6, 0.2), (0.6, 0.6), (0.2, 0.6)],
        severity=EventSeverity.HIGH,
    )
    engine = TemporalEventEngine(
        zone_manager=ZoneManager([zone]),
        persistence_threshold=3,
        exit_threshold=3,
    )
    source_id = "cam-welding"
    base_time = 1_000_000_000

    # Frames 1-3: Inside zone at (0.3, 0.3) -> Triggers ENTRY
    for f in range(1, 4):
        w = create_mock_worker(track_id=202, ground_x=0.3, ground_y=0.3)
        events = engine.process_frame(
            [w], timestamp_ns=base_time + (f * 100_000_000), source_id=source_id
        )

    assert len(events) == 1
    assert events[0].event_type == EventType.ZONE_ENTRY

    # Frames 4 & 5: Worker steps outside to (0.1, 0.1) -> Exit threshold not met yet
    w_out = create_mock_worker(track_id=202, ground_x=0.1, ground_y=0.1)
    e4 = engine.process_frame(
        [w_out], timestamp_ns=base_time + (4 * 100_000_000), source_id=source_id
    )
    assert len(e4) == 0

    e5 = engine.process_frame(
        [w_out], timestamp_ns=base_time + (5 * 100_000_000), source_id=source_id
    )
    assert len(e5) == 0

    # Frame 6: 3rd frame outside -> Emits ZONE_EXIT
    e6 = engine.process_frame(
        [w_out], timestamp_ns=base_time + (6 * 100_000_000), source_id=source_id
    )
    assert len(e6) == 1
    exit_evt = e6[0]
    assert exit_evt.event_type == EventType.ZONE_EXIT
    assert exit_evt.track_id == 202
    assert exit_evt.metadata["total_time_inside_sec"] > 0


def test_track_loss_closure():
    zone = RestrictedZone(
        zone_id="zone-chemical",
        name="Chemical Tank",
        polygon_points=[(0.3, 0.3), (0.7, 0.3), (0.7, 0.7), (0.3, 0.7)],
    )
    engine = TemporalEventEngine(
        zone_manager=ZoneManager([zone]),
        persistence_threshold=2,
    )
    source_id = "cam-chem"

    # Frame 1 & 2: Worker in zone -> Trigger violation
    w = create_mock_worker(track_id=303, ground_x=0.5, ground_y=0.5)
    engine.process_frame([w], timestamp_ns=1000, source_id=source_id)
    events = engine.process_frame([w], timestamp_ns=2000, source_id=source_id)
    assert len(events) == 1
    assert events[0].event_type == EventType.ZONE_ENTRY

    # Frame 3: Worker disappears completely (e.g. tracking lost or moved off camera)
    loss_events = engine.process_frame([], timestamp_ns=3000, source_id=source_id)
    assert len(loss_events) == 1
    assert loss_events[0].event_type == EventType.ZONE_EXIT
    assert loss_events[0].metadata["closure_reason"] == "track_lost"
    assert "Track lost" in loss_events[0].uncertainty_reasons[0]
