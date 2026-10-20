"""
Unit tests for sentinel.vision.tracking and sentinel.vision.ground_contact
"""

import pytest

from sentinel.vision.ground_contact import (
    calculate_ground_contact,
    calculate_head_region,
    calculate_torso_region,
)
from sentinel.vision.tracking import MultiObjectTracker, TrackState
from sentinel.vision.types import BoundingBox, Detection


def test_body_region_geometry():
    # Full person bbox from y=0.0 to y=1.0, x=0.2 to x=0.4
    bbox = BoundingBox(x1=0.2, y1=0.0, x2=0.4, y2=1.0)

    # Ground contact should be bottom-center: (0.3, 1.0)
    gx, gy = calculate_ground_contact(bbox)
    assert gx == pytest.approx(0.3)
    assert gy == pytest.approx(1.0)

    # Head region should be top 25%: y1=0.0 to y2=0.25
    head = calculate_head_region(bbox)
    assert head.x1 == 0.2
    assert head.x2 == 0.4
    assert head.y1 == 0.0
    assert head.y2 == pytest.approx(0.25)

    # Torso region should be 20% to 65%: y1=0.20 to y2=0.65
    torso = calculate_torso_region(bbox)
    assert torso.x1 == 0.2
    assert torso.x2 == 0.4
    assert torso.y1 == pytest.approx(0.20)
    assert torso.y2 == pytest.approx(0.65)


def test_track_id_persistence():
    tracker = MultiObjectTracker(iou_threshold=0.3)

    # Simulate a person walking horizontally across 5 frames
    for frame_id in range(1, 6):
        # Shift X by 0.02 each frame
        x1 = 0.1 + (frame_id * 0.02)
        x2 = 0.3 + (frame_id * 0.02)
        det = Detection(
            class_id=0,
            class_name="person",
            confidence=0.9,
            bbox=BoundingBox(x1=x1, y1=0.2, x2=x2, y2=0.8),
        )

        results = tracker.update([det], frame_id=frame_id)
        assert len(results) == 1
        assert results[0].track_id == 1  # Track ID must remain 1 across all frames

    # Verify trajectory
    traj = tracker.get_trajectory(track_id=1)
    assert len(traj) == 5
    assert traj[0][0] == 1
    assert traj[4][0] == 5

    # Verify track state is ACTIVE
    track = tracker.get_track(1)
    assert track is not None
    assert track.state == TrackState.ACTIVE
    assert track.hits == 5


def test_two_distinct_tracks():
    tracker = MultiObjectTracker()

    # Frame 1: Person A at left (0.1-0.2), Person B at right (0.7-0.8)
    det_a = Detection(
        class_id=0,
        class_name="person",
        confidence=0.9,
        bbox=BoundingBox(x1=0.1, y1=0.2, x2=0.2, y2=0.8),
    )
    det_b = Detection(
        class_id=0,
        class_name="person",
        confidence=0.85,
        bbox=BoundingBox(x1=0.7, y1=0.2, x2=0.8, y2=0.8),
    )

    res1 = tracker.update([det_a, det_b], frame_id=1)
    assert len(res1) == 2
    id_a = res1[0].track_id
    id_b = res1[1].track_id
    assert id_a != id_b

    # Frame 2: Both slight movement
    det_a2 = Detection(
        class_id=0,
        class_name="person",
        confidence=0.9,
        bbox=BoundingBox(x1=0.11, y1=0.2, x2=0.21, y2=0.8),
    )
    det_b2 = Detection(
        class_id=0,
        class_name="person",
        confidence=0.85,
        bbox=BoundingBox(x1=0.71, y1=0.2, x2=0.81, y2=0.8),
    )

    res2 = tracker.update([det_a2, det_b2], frame_id=2)
    assert res2[0].track_id == id_a
    assert res2[1].track_id == id_b


def test_occlusion_tolerance():
    tracker = MultiObjectTracker(max_lost_frames=5)

    # Frame 1 & 2: Object present
    det1 = Detection(
        class_id=0,
        class_name="person",
        confidence=0.9,
        bbox=BoundingBox(x1=0.3, y1=0.2, x2=0.5, y2=0.8),
    )
    tracker.update([det1], frame_id=1)
    tracker.update([det1], frame_id=2)

    # Frames 3 & 4: Occluded (empty detections)
    tracker.update([], frame_id=3)
    tracker.update([], frame_id=4)
    assert tracker.get_track(1).state == TrackState.LOST

    # Frame 5: Reappears nearby
    det5 = Detection(
        class_id=0,
        class_name="person",
        confidence=0.9,
        bbox=BoundingBox(x1=0.32, y1=0.2, x2=0.52, y2=0.8),
    )
    res5 = tracker.update([det5], frame_id=5)
    assert len(res5) == 1
    # Must retain original track ID = 1!
    assert res5[0].track_id == 1
    assert tracker.get_track(1).state == TrackState.ACTIVE


def test_track_removal_after_max_lost():
    tracker = MultiObjectTracker(max_lost_frames=2)

    # Frame 1: Object present
    det = Detection(
        class_id=0,
        class_name="person",
        confidence=0.9,
        bbox=BoundingBox(x1=0.3, y1=0.2, x2=0.5, y2=0.8),
    )
    tracker.update([det], frame_id=1)

    # Frames 2, 3, 4: Object gone (> max_lost_frames=2)
    tracker.update([], frame_id=2)
    tracker.update([], frame_id=3)
    tracker.update([], frame_id=4)

    # Track 1 should now be completely removed from active tracker table
    assert tracker.get_track(1) is None
