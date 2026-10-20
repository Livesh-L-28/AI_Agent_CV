"""
Unit and temporal tests for sentinel.rules.ppe (PPEAssociationEngine)
"""

import time

from sentinel.rules.ppe import PPEAssociationEngine, PPEStatus, PPEType
from sentinel.rules.types import EventType
from sentinel.vision.types import BoundingBox, Detection


def test_compliant_worker_hardhat_and_vest():
    engine = PPEAssociationEngine(persistence_threshold=3)

    # Worker bbox: x: 0.2..0.4, y: 0.2..0.8 (height = 0.6)
    # Head region: y: 0.2..0.35
    # Torso region: y: 0.32..0.59
    worker = Detection(
        class_id=0,
        class_name="person",
        confidence=0.92,
        bbox=BoundingBox(x1=0.2, y1=0.2, x2=0.4, y2=0.8),
        track_id=1,
    )

    # Helmet placed exactly on head region
    helmet = Detection(
        class_id=10,
        class_name="safety_helmet",
        confidence=0.88,
        bbox=BoundingBox(x1=0.22, y1=0.2, x2=0.38, y2=0.34),
    )

    # Vest placed on torso region
    vest = Detection(
        class_id=11,
        class_name="safety_vest",
        confidence=0.85,
        bbox=BoundingBox(x1=0.21, y1=0.34, x2=0.39, y2=0.58),
    )

    obs_map, events = engine.associate_frame(
        persons=[worker],
        ppe_items=[helmet, vest],
        frame_id=1,
        timestamp_ns=time.time_ns(),
        source_id="test-cam",
    )

    assert 1 in obs_map
    worker_obs = obs_map[1]
    assert worker_obs[PPEType.HARDHAT].status == PPEStatus.COMPLIANT
    assert worker_obs[PPEType.HARDHAT].matched_detection == helmet
    assert worker_obs[PPEType.SAFETY_VEST].status == PPEStatus.COMPLIANT
    assert len(events) == 0


def test_single_frame_missing_ppe_is_uncertain():
    engine = PPEAssociationEngine(persistence_threshold=5)

    worker = Detection(
        class_id=0,
        class_name="person",
        confidence=0.90,
        bbox=BoundingBox(x1=0.3, y1=0.2, x2=0.5, y2=0.8),
        track_id=2,
    )

    # No PPE detections in frame
    obs_map, events = engine.associate_frame(
        persons=[worker],
        ppe_items=[],
        frame_id=1,
        timestamp_ns=time.time_ns(),
        source_id="test-cam",
    )

    # A single missing observation must be UNCERTAIN, NOT NON_COMPLIANT!
    assert obs_map[2][PPEType.HARDHAT].status == PPEStatus.UNCERTAIN
    assert "unconfirmed for 1 frames" in obs_map[2][PPEType.HARDHAT].uncertainty_reason
    assert len(events) == 0


def test_persistent_missing_ppe_triggers_violation():
    engine = PPEAssociationEngine(persistence_threshold=4)
    worker = Detection(
        class_id=0,
        class_name="person",
        confidence=0.95,
        bbox=BoundingBox(x1=0.3, y1=0.2, x2=0.5, y2=0.8),
        track_id=5,
    )

    base_time = time.time_ns()

    # Frames 1 to 3: Missing helmet -> UNCERTAIN
    for f in range(1, 4):
        obs, events = engine.associate_frame(
            persons=[worker],
            ppe_items=[],
            frame_id=f,
            timestamp_ns=base_time + (f * 40_000_000),
            source_id="test-cam",
        )
        assert obs[5][PPEType.HARDHAT].status == PPEStatus.UNCERTAIN
        assert len(events) == 0

    # Frame 4: Persistence threshold (4) reached -> NON_COMPLIANT + Event Candidate
    obs_4, events_4 = engine.associate_frame(
        persons=[worker],
        ppe_items=[],
        frame_id=4,
        timestamp_ns=base_time + (4 * 40_000_000),
        source_id="test-cam",
    )

    assert obs_4[5][PPEType.HARDHAT].status == PPEStatus.NON_COMPLIANT
    assert len(events_4) == 1
    evt = events_4[0]
    assert evt.event_type == EventType.PPE_VIOLATION
    assert evt.track_id == 5
    assert evt.persistence_count == 4
    assert evt.metadata["ppe_type"] == PPEType.HARDHAT.value


def test_worker_occlusion_handling():
    engine = PPEAssociationEngine(persistence_threshold=3)

    # Worker with very low detection confidence (occluded / dark)
    occluded_worker = Detection(
        class_id=0,
        class_name="person",
        confidence=0.30,  # Below occlusion threshold
        bbox=BoundingBox(x1=0.1, y1=0.1, x2=0.3, y2=0.7),
        track_id=8,
    )

    obs_map, events = engine.associate_frame(
        persons=[occluded_worker],
        ppe_items=[],
        frame_id=1,
        timestamp_ns=time.time_ns(),
        source_id="test-cam",
    )

    assert obs_map[8][PPEType.HARDHAT].status == PPEStatus.OCCLUDED
    assert "occluded" in obs_map[8][PPEType.HARDHAT].uncertainty_reason
    assert len(events) == 0


def test_multi_worker_ppe_spatial_separation():
    engine = PPEAssociationEngine(persistence_threshold=3)

    # Worker 1 at left
    w1 = Detection(
        class_id=0,
        class_name="person",
        confidence=0.9,
        bbox=BoundingBox(x1=0.1, y1=0.2, x2=0.25, y2=0.8),
        track_id=10,
    )
    # Worker 2 at right
    w2 = Detection(
        class_id=0,
        class_name="person",
        confidence=0.9,
        bbox=BoundingBox(x1=0.7, y1=0.2, x2=0.85, y2=0.8),
        track_id=20,
    )

    # Helmet on Worker 1's head only
    helmet_1 = Detection(
        class_id=10,
        class_name="safety_helmet",
        confidence=0.88,
        bbox=BoundingBox(x1=0.12, y1=0.2, x2=0.23, y2=0.34),
    )

    obs_map, events = engine.associate_frame(
        persons=[w1, w2],
        ppe_items=[helmet_1],
        frame_id=1,
        timestamp_ns=time.time_ns(),
        source_id="test-cam",
    )

    assert obs_map[10][PPEType.HARDHAT].status == PPEStatus.COMPLIANT
    assert obs_map[20][PPEType.HARDHAT].status == PPEStatus.UNCERTAIN
    assert len(events) == 0
