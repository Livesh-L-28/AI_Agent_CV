"""
Deterministic Multi-Object Tracking Engine.
Provides persistent track IDs, trajectory history, and occlusion tolerance.
"""

import math
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from sentinel.vision.geometry import compute_iou
from sentinel.vision.ground_contact import calculate_ground_contact
from sentinel.vision.types import BoundingBox, Detection


class TrackState(str, Enum):
    NEW = "NEW"
    ACTIVE = "ACTIVE"
    LOST = "LOST"
    REMOVED = "REMOVED"


class TrackedEntity(BaseModel):
    """Represents a tracked physical entity with trajectory history."""

    track_id: int
    class_id: int
    class_name: str
    current_bbox: BoundingBox
    ground_point: tuple[float, float]
    confidence: float
    state: TrackState = TrackState.NEW
    first_frame_id: int
    last_frame_id: int
    hits: int = 1
    time_since_update: int = 0
    trajectory: list[tuple[int, tuple[float, float]]] = Field(default_factory=list)

    @property
    def bbox(self) -> BoundingBox:
        """Alias for current_bbox for compatibility across visual renderers."""
        return self.current_bbox

    @property
    def ground_contact_point(self) -> tuple[float, float]:
        """Alias for ground_point for compatibility across spatial homography engines."""
        return self.ground_point

    def add_observation(self, bbox: BoundingBox, confidence: float, frame_id: int) -> None:
        """Updates entity with a new detection observation."""
        self.current_bbox = bbox
        self.ground_point = calculate_ground_contact(bbox)
        self.confidence = confidence
        self.last_frame_id = frame_id
        self.hits += 1
        self.time_since_update = 0
        self.trajectory.append((frame_id, self.ground_point))

        # Bound trajectory history to recent 150 points
        if len(self.trajectory) > 150:
            self.trajectory.pop(0)

        if self.hits >= 2:
            self.state = TrackState.ACTIVE


class MultiObjectTracker:
    """
    Deterministic multi-object tracker based on spatial IoU and centroid proximity.
    Maintains stable track IDs across frames and handles brief occlusions.
    """

    def __init__(
        self,
        iou_threshold: float = 0.25,
        max_lost_frames: int = 15,
        min_hits: int = 2,
    ) -> None:
        self.iou_threshold = iou_threshold
        self.max_lost_frames = max_lost_frames
        self.min_hits = min_hits

        self.next_track_id: int = 1
        self.tracks: dict[int, TrackedEntity] = {}

    def reset(self) -> None:
        """Resets tracker state."""
        self.next_track_id = 1
        self.tracks.clear()

    def update(self, detections: list[Detection], frame_id: int) -> list[Detection]:
        """
        Updates tracks with detections for the given frame_id.
        Assigns stable track_id to each matched detection.
        """
        active_and_lost_ids = [
            tid
            for tid, trk in self.tracks.items()
            if trk.state in (TrackState.NEW, TrackState.ACTIVE, TrackState.LOST)
        ]

        unmatched_detections = set(range(len(detections)))
        unmatched_tracks = set(active_and_lost_ids)
        matched_pairs: list[tuple[int, int]] = []

        # 1. Spatial Matching using IoU and Distance Cost
        if active_and_lost_ids and detections:
            cost_matrix = []
            for tid in active_and_lost_ids:
                track = self.tracks[tid]
                row = []
                for det in detections:
                    if track.class_name != det.class_name:
                        # Don't match different classes (e.g. person with vehicle)
                        score = 0.0
                    else:
                        iou = compute_iou(track.current_bbox, det.bbox)
                        # Proximity bonus between ground contact points
                        tx, ty = track.ground_point
                        dx, dy = calculate_ground_contact(det.bbox)
                        dist = math.hypot(tx - dx, ty - dy)
                        prox_score = max(0.0, 1.0 - (dist * 2.5))
                        score = (iou * 0.7) + (prox_score * 0.3)
                    row.append(score)
                cost_matrix.append(row)

            # Greedy best-match selection
            matches: list[tuple[float, int, int]] = []
            for t_idx, tid in enumerate(active_and_lost_ids):
                for d_idx in range(len(detections)):
                    score = cost_matrix[t_idx][d_idx]
                    if score >= self.iou_threshold:
                        matches.append((score, tid, d_idx))

            # Sort descending by score
            matches.sort(key=lambda x: x[0], reverse=True)

            assigned_tracks: set[int] = set()
            assigned_dets: set[int] = set()

            for score, tid, d_idx in matches:
                if tid not in assigned_tracks and d_idx not in assigned_dets:
                    assigned_tracks.add(tid)
                    assigned_dets.add(d_idx)
                    matched_pairs.append((tid, d_idx))

            unmatched_tracks -= assigned_tracks
            unmatched_detections -= assigned_dets

        # 2. Update matched tracks
        for tid, d_idx in matched_pairs:
            det = detections[d_idx]
            track = self.tracks[tid]
            track.add_observation(det.bbox, det.confidence, frame_id)
            det.track_id = tid

        # 3. Handle unmatched tracks (mark as LOST or REMOVED)
        for tid in unmatched_tracks:
            track = self.tracks[tid]
            track.time_since_update += 1
            if track.time_since_update > self.max_lost_frames:
                track.state = TrackState.REMOVED
            else:
                track.state = TrackState.LOST

        # 4. Initialize new tracks for unmatched detections
        for d_idx in unmatched_detections:
            det = detections[d_idx]
            new_id = self.next_track_id
            self.next_track_id += 1

            new_track = TrackedEntity(
                track_id=new_id,
                class_id=det.class_id,
                class_name=det.class_name,
                current_bbox=det.bbox,
                ground_point=calculate_ground_contact(det.bbox),
                confidence=det.confidence,
                state=TrackState.NEW,
                first_frame_id=frame_id,
                last_frame_id=frame_id,
                hits=1,
                time_since_update=0,
                trajectory=[(frame_id, calculate_ground_contact(det.bbox))],
            )
            self.tracks[new_id] = new_track
            det.track_id = new_id

        # Clean up REMOVED tracks to avoid unbounded memory growth
        self.tracks = {
            tid: trk for tid, trk in self.tracks.items() if trk.state != TrackState.REMOVED
        }

        return detections

    def get_active_tracks(self) -> list[TrackedEntity]:
        """Returns all confirmed active tracks."""
        return [trk for trk in self.tracks.values() if trk.state == TrackState.ACTIVE]

    def get_track(self, track_id: int) -> Optional[TrackedEntity]:
        """Retrieves a specific track by ID."""
        return self.tracks.get(track_id)

    def get_trajectory(self, track_id: int) -> list[tuple[int, tuple[float, float]]]:
        """Returns the ground-point trajectory sequence for a track ID."""
        track = self.tracks.get(track_id)
        return track.trajectory if track else []
