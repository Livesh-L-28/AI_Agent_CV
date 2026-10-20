"""
Deterministic Temporal Event Engine.
Transforms tracks and spatial geometry into structured safety event candidates
with persistence thresholds, cooldown windows, and deduplication.
"""

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


class TemporalEventEngine:
    """
    Deterministic rule and temporal persistence engine.
    Ensures transient noise or 1-frame boundary flickers do not generate false alarms.
    """

    def __init__(
        self,
        zone_manager: ZoneManager,
        persistence_threshold: int = 5,
        exit_threshold: int = 3,
        cooldown_seconds: float = 10.0,
    ) -> None:
        self.zone_manager = zone_manager
        self.persistence_threshold = persistence_threshold
        self.exit_threshold = exit_threshold
        self.cooldown_ns = int(cooldown_seconds * 1_000_000_000)

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
            # We only evaluate persons for restricted zone worker safety
            if entity.class_name != "person":
                continue

            current_frame_tracks.add((source_id, entity.track_id))
            gx, gy = entity.ground_point

            for zone in active_zones:
                if not zone.enabled:
                    continue

                state = self._get_or_create_state(source_id, entity.track_id, zone.zone_id)
                is_inside = zone.contains_point((gx, gy))

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
                    if state.consecutive_inside == 1:
                        state.first_inside_ns = timestamp_ns
                    state.last_inside_ns = timestamp_ns
                    state.supporting_detections.append(det)

                    # Keep only last 10 supporting detections
                    if len(state.supporting_detections) > 10:
                        state.supporting_detections.pop(0)

                    # Check persistence threshold
                    if (
                        state.consecutive_inside >= self.persistence_threshold
                        and not state.is_active_violation
                    ):
                        # Trigger ZONE_ENTRY Event Candidate
                        event_id = generate_event_id("evt_zone_entry")
                        state.is_active_violation = True
                        state.active_event_id = event_id
                        state.last_emitted_ns = timestamp_ns

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
                            },
                        )
                        emitted_events.append(candidate)
                        logger.warning(
                            f"Safety Event Candidate: Worker #{entity.track_id} entered {zone.name} "
                            f"(persistence={state.consecutive_inside})"
                        )

                else:
                    # Entity is outside this zone
                    if state.is_active_violation:
                        state.consecutive_outside += 1
                        if state.consecutive_outside >= self.exit_threshold:
                            # Trigger ZONE_EXIT Event Candidate
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
                                last_observation_ns=timestamp_ns,
                                persistence_count=state.consecutive_inside,
                                confidence=round(entity.confidence, 3),
                                deduplication_key=dedup_key,
                                supporting_detections=[det],
                                metadata={
                                    "zone_name": zone.name,
                                    "previous_entry_event_id": state.active_event_id,
                                    "total_time_inside_sec": round(
                                        (state.last_inside_ns - state.first_inside_ns)
                                        / 1_000_000_000.0,
                                        2,
                                    ),
                                },
                            )
                            emitted_events.append(candidate)
                            logger.info(
                                f"Safety Event Candidate: Worker #{entity.track_id} exited {zone.name}"
                            )

                            # Reset violation state
                            state.is_active_violation = False
                            state.consecutive_inside = 0
                            state.active_event_id = None
                            state.supporting_detections.clear()
                    else:
                        state.consecutive_inside = 0

        # Handle track loss: if an active track was in a zone and disappeared completely
        lost_tracks = self.known_active_tracks - current_frame_tracks
        for s_id, t_id in lost_tracks:
            for zone in active_zones:
                key = (s_id, t_id, zone.zone_id)
                if key in self.state_table:
                    state = self.state_table[key]
                    if state.is_active_violation:
                        # Auto-close violation due to track loss
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
                            uncertainty_reasons=["Track lost or worker exited field of view"],
                            metadata={
                                "zone_name": zone.name,
                                "closure_reason": "track_lost",
                            },
                        )
                        emitted_events.append(candidate)
                        state.is_active_violation = False
                        state.consecutive_inside = 0
                        state.active_event_id = None

        self.known_active_tracks = current_frame_tracks
        return emitted_events
