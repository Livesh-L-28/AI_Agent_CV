"""
Deterministic Temporal Event Engine.
Transforms tracks and spatial geometry into structured safety event candidates
with timestamp-aware persistence thresholds, occlusion grace periods, and deduplication.
"""

from __future__ import annotations

from typing import Optional

from sentinel.logging import setup_logging
from sentinel.rules.types import (
    EventSeverity,
    EventType,
    SafetyEventCandidate,
    generate_event_id,
)
from sentinel.rules.zones import ZoneManager
from sentinel.vision.tracking import TrackedEntity
from sentinel.vision.types import Detection

logger = setup_logging()


class ZoneTrackState:
    """Tracks the temporal state of an individual entity relative to a specific zone."""

    def __init__(self, track_id: int, zone_id: str, source_id: str) -> None:
        self.track_id = track_id
        self.zone_id = zone_id
        self.source_id = source_id

        self.consecutive_inside: int = 0
        self.consecutive_outside: int = 0
        self.first_inside_ns: int = 0
        self.last_inside_ns: int = 0
        self.is_active_violation: bool = False
        self.last_emitted_ns: int = 0
        self.active_event_id: Optional[str] = None
        self.supporting_detections: list[Detection] = []

        # Occlusion and track continuity state (DEF-05)
        self.lost_frames_count: int = 0
        self.last_seen_ns: int = 0


class TemporalEventEngine:
    """
    Timestamp-aware deterministic rule and temporal persistence engine.
    Ensures transient noise or 1-frame boundary flickers do not generate false alarms,
    and temporary occlusion does not prematurely fragment active incidents.
    """

    def __init__(
        self,
        zone_manager: ZoneManager,
        persistence_threshold: int = 5,
        exit_threshold: int = 3,
        cooldown_seconds: float = 10.0,
        persistence_duration_ns: int = 0,
        track_loss_grace_frames: int = 3,
        max_observation_gap_ns: int = 5_000_000_000,
    ) -> None:
        """
        Args:
            zone_manager: Configured zone repository.
            persistence_threshold: Minimum consecutive observations inside zone.
            exit_threshold: Minimum consecutive observations outside zone to confirm exit.
            cooldown_seconds: Suppresses duplicate dispatches during active violation.
            persistence_duration_ns: Minimum elapsed time in nanoseconds (0 = count-only).
            track_loss_grace_frames: Frames of track loss tolerated before closing violation.
            max_observation_gap_ns: Maximum gap between frames before resetting streak.
        """
        self.zone_manager = zone_manager
        self.persistence_threshold = persistence_threshold
        self.exit_threshold = exit_threshold
        self.cooldown_ns = int(cooldown_seconds * 1_000_000_000)
        self.persistence_duration_ns = persistence_duration_ns
        self.track_loss_grace_frames = track_loss_grace_frames
        self.max_observation_gap_ns = max_observation_gap_ns

        # Key: (source_id, track_id, zone_id) -> ZoneTrackState
        self.state_table: dict[tuple[str, int, str], ZoneTrackState] = {}
        self.known_active_tracks: set[tuple[str, int]] = set()

    def reset(self) -> None:
        """Resets engine state."""
        self.state_table.clear()
        self.known_active_tracks.clear()

    def _get_or_create_state(self, source_id: str, track_id: int, zone_id: str) -> ZoneTrackState:
        key = (source_id, track_id, zone_id)
        if key not in self.state_table:
            self.state_table[key] = ZoneTrackState(
                track_id=track_id, zone_id=zone_id, source_id=source_id
            )
        return self.state_table[key]

    def process_frame(
        self,
        tracked_entities: list[TrackedEntity],
        timestamp_ns: int,
        source_id: str,
    ) -> list[SafetyEventCandidate]:
        """
        Evaluates tracked entities against all active safety zones for the current frame.
        Emits event candidates when persistence thresholds or exit conditions are met.
        """
        emitted_events: list[SafetyEventCandidate] = []
        current_frame_tracks: set[tuple[str, int]] = set()
        active_zones = self.zone_manager.list_zones()

        for entity in tracked_entities:
            # Only evaluate persons for restricted zone worker safety
            if entity.class_name != "person":
                continue

            current_frame_tracks.add((source_id, entity.track_id))
            gx, gy = entity.ground_point

            for zone in active_zones:
                if not zone.enabled:
                    continue

                state = self._get_or_create_state(source_id, entity.track_id, zone.zone_id)
                is_inside = zone.contains_point((gx, gy))

                # Handle clock anomalies / non-monotonic timestamps (DEF-04)
                if state.last_inside_ns > 0 and timestamp_ns < state.last_inside_ns:
                    logger.warning(
                        f"Clock anomaly detected for track #{entity.track_id}: "
                        f"timestamp {timestamp_ns} < last_inside_ns {state.last_inside_ns}. Clamping."
                    )
                    effective_timestamp_ns = state.last_inside_ns
                else:
                    effective_timestamp_ns = timestamp_ns

                # Handle stale gap in observations (dropped connection or stalled camera)
                if state.last_inside_ns > 0 and (effective_timestamp_ns - state.last_inside_ns) > self.max_observation_gap_ns:
                    logger.info(
                        f"Stale observation gap ({effective_timestamp_ns - state.last_inside_ns} ns) "
                        f"for track #{entity.track_id}. Resetting persistence streak."
                    )
                    state.consecutive_inside = 0
                    state.first_inside_ns = effective_timestamp_ns

                # Reacquisition from brief occlusion (DEF-05)
                if state.lost_frames_count > 0:
                    logger.debug(
                        f"Track #{entity.track_id} reacquired after {state.lost_frames_count} occluded frames. "
                        f"Preserving active violation."
                    )
                    state.lost_frames_count = 0

                # Build detection reference
                det = Detection(
                    class_id=entity.class_id,
                    class_name=entity.class_name,
                    confidence=entity.confidence,
                    bbox=entity.current_bbox,
                    track_id=entity.track_id,
                )

                if is_inside:
                    state.consecutive_inside += 1
                    state.consecutive_outside = 0
                    if state.consecutive_inside == 1 or state.first_inside_ns == 0:
                        state.first_inside_ns = effective_timestamp_ns
                    state.last_inside_ns = effective_timestamp_ns
                    state.last_seen_ns = effective_timestamp_ns
                    state.supporting_detections.append(det)

                    # Keep only last 10 supporting detections
                    if len(state.supporting_detections) > 10:
                        state.supporting_detections.pop(0)

                    # Evaluate persistence: both observation count and elapsed duration (DEF-04)
                    elapsed_ns = effective_timestamp_ns - state.first_inside_ns
                    duration_satisfied = (self.persistence_duration_ns <= 0) or (
                        elapsed_ns >= self.persistence_duration_ns
                    )
                    count_satisfied = state.consecutive_inside >= self.persistence_threshold

                    if duration_satisfied and count_satisfied and not state.is_active_violation:
                        # Trigger ZONE_ENTRY Event Candidate
                        event_id = generate_event_id("evt_zone_entry")
                        state.is_active_violation = True
                        state.active_event_id = event_id
                        state.last_emitted_ns = effective_timestamp_ns

                        dedup_key = f"{source_id}:{entity.track_id}:{zone.zone_id}:{EventType.ZONE_ENTRY.value}"

                        candidate = SafetyEventCandidate(
                            event_id=event_id,
                            event_type=EventType.ZONE_ENTRY,
                            severity=zone.severity,
                            source_id=source_id,
                            track_id=entity.track_id,
                            zone_id=zone.zone_id,
                            rule_id=f"RULE_RESTRICTED_ZONE_{zone.zone_id}",
                            rule_version="1.0.0",
                            first_observation_ns=state.first_inside_ns,
                            last_observation_ns=state.last_inside_ns,
                            persistence_count=state.consecutive_inside,
                            confidence=round(entity.confidence, 3),
                            deduplication_key=dedup_key,
                            supporting_detections=list(state.supporting_detections),
                            metadata={
                                "zone_name": zone.name,
                                "zone_type": zone.zone_type.value,
                                "ground_contact_point": [round(gx, 4), round(gy, 4)],
                                "elapsed_persistence_ns": elapsed_ns,
                            },
                        )
                        emitted_events.append(candidate)
                        logger.warning(
                            f"Safety Event Candidate: Worker #{entity.track_id} entered {zone.name} "
                            f"(persistence={state.consecutive_inside}, elapsed={elapsed_ns / 1e6:.1f}ms)"
                        )

                else:
                    # Entity is observed outside this zone
                    state.last_seen_ns = effective_timestamp_ns
                    if state.is_active_violation:
                        state.consecutive_outside += 1
                        if state.consecutive_outside >= self.exit_threshold:
                            # Trigger confirmed ZONE_EXIT Event Candidate
                            exit_event_id = generate_event_id("evt_zone_exit")
                            dedup_key = f"{source_id}:{entity.track_id}:{zone.zone_id}:{EventType.ZONE_EXIT.value}"

                            candidate = SafetyEventCandidate(
                                event_id=exit_event_id,
                                event_type=EventType.ZONE_EXIT,
                                severity=EventSeverity.INFO,
                                source_id=source_id,
                                track_id=entity.track_id,
                                zone_id=zone.zone_id,
                                rule_id=f"RULE_RESTRICTED_ZONE_{zone.zone_id}",
                                rule_version="1.0.0",
                                first_observation_ns=state.first_inside_ns,
                                last_observation_ns=effective_timestamp_ns,
                                persistence_count=state.consecutive_inside,
                                confidence=round(entity.confidence, 3),
                                deduplication_key=dedup_key,
                                supporting_detections=[det],
                                metadata={
                                    "zone_name": zone.name,
                                    "previous_entry_event_id": state.active_event_id,
                                    "closure_reason": "confirmed_exit",
                                    "total_time_inside_sec": round(
                                        (effective_timestamp_ns - state.first_inside_ns)
                                        / 1_000_000_000.0,
                                        2,
                                    ),
                                },
                            )
                            emitted_events.append(candidate)
                            logger.info(
                                f"Safety Event Candidate: Worker #{entity.track_id} confirmed exit from {zone.name}"
                            )

                            # Reset violation state
                            state.is_active_violation = False
                            state.consecutive_inside = 0
                            state.active_event_id = None
                            state.supporting_detections.clear()
                    else:
                        state.consecutive_inside = 0

        # Handle track loss with occlusion grace period (DEF-05)
        lost_tracks = self.known_active_tracks - current_frame_tracks
        for s_id, t_id in lost_tracks:
            for zone in active_zones:
                key = (s_id, t_id, zone.zone_id)
                if key in self.state_table:
                    state = self.state_table[key]
                    if state.is_active_violation:
                        state.lost_frames_count += 1
                        if state.lost_frames_count <= self.track_loss_grace_frames:
                            # Tolerated temporary occlusion: DO NOT close violation yet!
                            logger.debug(
                                f"Track #{t_id} occluded (lost for {state.lost_frames_count}/"
                                f"{self.track_loss_grace_frames} frames), preserving active violation."
                            )
                        else:
                            # Grace period exceeded: confirmed track loss / end-of-track
                            exit_event_id = generate_event_id("evt_zone_exit")
                            dedup_key = f"{s_id}:{t_id}:{zone.zone_id}:ZONE_EXIT_TRACK_LOST"
                            candidate = SafetyEventCandidate(
                                event_id=exit_event_id,
                                event_type=EventType.ZONE_EXIT,
                                severity=EventSeverity.LOW,
                                source_id=s_id,
                                track_id=t_id,
                                zone_id=zone.zone_id,
                                rule_id=f"RULE_RESTRICTED_ZONE_{zone.zone_id}",
                                rule_version="1.0.0",
                                first_observation_ns=state.first_inside_ns,
                                last_observation_ns=timestamp_ns,
                                persistence_count=state.consecutive_inside,
                                confidence=0.5,
                                deduplication_key=dedup_key,
                                uncertainty_reasons=[
                                    f"Track lost beyond grace period ({state.lost_frames_count} frames missing)"
                                ],
                                metadata={
                                    "zone_name": zone.name,
                                    "closure_reason": "track_lost",
                                    "missing_frames": state.lost_frames_count,
                                },
                            )
                            emitted_events.append(candidate)
                            state.is_active_violation = False
                            state.consecutive_inside = 0
                            state.active_event_id = None
                            state.lost_frames_count = 0

        # Preserve known tracks that are within occlusion grace period
        retained_known_tracks: set[tuple[str, int]] = set(current_frame_tracks)
        for s_id, t_id in self.known_active_tracks:
            for zone in active_zones:
                state = self.state_table.get((s_id, t_id, zone.zone_id))
                if state and state.is_active_violation and state.lost_frames_count > 0:
                    retained_known_tracks.add((s_id, t_id))

        self.known_active_tracks = retained_known_tracks
        return emitted_events

    def close_source(self, source_id: str, timestamp_ns: int) -> list[SafetyEventCandidate]:
        """
        Flushes and cleanly closes all active violations when a video source stops or completes replay.
        """
        closed_events: list[SafetyEventCandidate] = []
        for (s_id, t_id, z_id), state in list(self.state_table.items()):
            if s_id == source_id and state.is_active_violation:
                exit_id = generate_event_id("evt_zone_exit")
                candidate = SafetyEventCandidate(
                    event_id=exit_id,
                    event_type=EventType.ZONE_EXIT,
                    severity=EventSeverity.INFO,
                    source_id=s_id,
                    track_id=t_id,
                    zone_id=z_id,
                    rule_id=f"RULE_RESTRICTED_ZONE_{z_id}",
                    rule_version="1.0.0",
                    first_observation_ns=state.first_inside_ns,
                    last_observation_ns=timestamp_ns,
                    persistence_count=state.consecutive_inside,
                    confidence=1.0,
                    deduplication_key=f"{s_id}:{t_id}:{z_id}:SOURCE_SHUTDOWN",
                    metadata={
                        "closure_reason": "source_shutdown",
                        "total_time_inside_sec": round(
                            (timestamp_ns - state.first_inside_ns) / 1e9, 2
                        ),
                    },
                )
                closed_events.append(candidate)
                state.is_active_violation = False
                state.consecutive_inside = 0
                state.active_event_id = None

        return closed_events
