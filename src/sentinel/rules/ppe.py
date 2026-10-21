"""
Person-to-PPE Geometric & Temporal Association Engine.
Associates detected safety equipment with workers and handles occlusion and uncertainty.
"""

from collections import deque
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

from sentinel.logging import setup_logging
from sentinel.rules.types import (
    EventSeverity,
    EventType,
    SafetyEventCandidate,
    generate_event_id,
)
from sentinel.vision.geometry import compute_iou
from sentinel.vision.ground_contact import calculate_head_region, calculate_torso_region
from sentinel.vision.types import Detection

logger = setup_logging()


class PPEType(str, Enum):
    HARDHAT = "HARDHAT"
    SAFETY_VEST = "SAFETY_VEST"
    GOGGLES = "GOGGLES"


class PPEStatus(str, Enum):
    COMPLIANT = "COMPLIANT"
    NON_COMPLIANT = "NON_COMPLIANT"
    UNCERTAIN = "UNCERTAIN"
    OCCLUDED = "OCCLUDED"


class PPEObservation(BaseModel):
    """Observation of a specific PPE item on a worker for a single frame."""

    ppe_type: PPEType
    status: PPEStatus
    confidence: float = Field(ge=0.0, le=1.0)
    matched_detection: Optional[Detection] = None
    uncertainty_reason: Optional[str] = None


class WorkerPPEProfile:
    """Maintains temporal history of PPE observations for a tracked worker."""

    def __init__(self, track_id: int, history_len: int = 15) -> None:
        self.track_id = track_id
        self.history: deque[dict[PPEType, PPEObservation]] = deque(maxlen=history_len)
        self.consecutive_missing_hardhat: int = 0
        self.consecutive_missing_vest: int = 0
        self.last_violation_emitted_ns: int = 0
        self.active_violation_type: Optional[PPEType] = None


class PPEAssociationEngine:
    """
    Associates PPE detections with tracked persons based on anatomical body geometry
    and accumulates evidence temporally to prevent false noncompliance alarms.
    """

    def __init__(
        self,
        persistence_threshold: int = 6,
        overlap_threshold: float = 0.35,
        cooldown_seconds: float = 15.0,
        ppe_capability_enabled: bool = True,
    ) -> None:
        self.persistence_threshold = persistence_threshold
        self.overlap_threshold = overlap_threshold
        self.cooldown_ns = int(cooldown_seconds * 1_000_000_000)
        self.ppe_capability_enabled = ppe_capability_enabled

        # Map of track_id -> WorkerPPEProfile
        self.profiles: dict[int, WorkerPPEProfile] = {}

    def reset(self) -> None:
        self.profiles.clear()

    def _get_or_create_profile(self, track_id: int) -> WorkerPPEProfile:
        if track_id not in self.profiles:
            self.profiles[track_id] = WorkerPPEProfile(track_id=track_id)
        return self.profiles[track_id]

    def associate_frame(
        self,
        persons: list[Detection],
        ppe_items: list[Detection],
        frame_id: int,
        timestamp_ns: int,
        source_id: str,
        required_ppe: Optional[list[PPEType]] = None,
    ) -> tuple[dict[int, dict[PPEType, PPEObservation]], list[SafetyEventCandidate]]:
        """
        Associates PPE items with workers and generates verified temporal violation events.
        """
        if required_ppe is None:
            required_ppe = [PPEType.HARDHAT, PPEType.SAFETY_VEST]

        frame_results: dict[int, dict[PPEType, PPEObservation]] = {}
        events: list[SafetyEventCandidate] = []

        # DEF-02 Fix: When PPE capability is disabled (e.g. COCO checkpoint without PPE classes),
        # honestly report UNCERTAIN status and never emit false-positive compliance violations.
        if not self.ppe_capability_enabled:
            for person in persons:
                if person.track_id is None:
                    continue
                frame_results[person.track_id] = {
                    req: PPEObservation(
                        ppe_type=req,
                        status=PPEStatus.UNCERTAIN,
                        confidence=0.0,
                        uncertainty_reason=(
                            "PPE capability unsupported by active model checkpoint. "
                            "Compliance rules bypassed to prevent false-positive violations."
                        ),
                    )
                    for req in required_ppe
                }
            return frame_results, []

        # Separate ppe_items by category
        helmets = [
            d
            for d in ppe_items
            if "helmet" in d.class_name.lower() or "hardhat" in d.class_name.lower()
        ]
        vests = [d for d in ppe_items if "vest" in d.class_name.lower()]

        for person in persons:
            if person.track_id is None:
                continue

            track_id = person.track_id
            profile = self._get_or_create_profile(track_id)
            observations: dict[PPEType, PPEObservation] = {}

            # Check for occlusion or low person confidence
            is_occluded = person.confidence < 0.45 or person.bbox.height < 0.12

            # 1. HARDHAT EVALUATION
            if PPEType.HARDHAT in required_ppe:
                if is_occluded:
                    obs = PPEObservation(
                        ppe_type=PPEType.HARDHAT,
                        status=PPEStatus.OCCLUDED,
                        confidence=person.confidence,
                        uncertainty_reason="Worker bounding box occluded, truncated, or low resolution",
                    )
                else:
                    head_region = calculate_head_region(person.bbox)
                    best_helmet = None
                    best_overlap = 0.0

                    for h in helmets:
                        overlap = compute_iou(head_region, h.bbox)
                        if overlap > best_overlap:
                            best_overlap = overlap
                            best_helmet = h

                    if best_helmet and best_overlap >= self.overlap_threshold:
                        obs = PPEObservation(
                            ppe_type=PPEType.HARDHAT,
                            status=PPEStatus.COMPLIANT,
                            confidence=round(best_helmet.confidence, 3),
                            matched_detection=best_helmet,
                        )
                        profile.consecutive_missing_hardhat = 0
                    else:
                        # Missing detection on single frame is UNCERTAIN, not immediate violation
                        profile.consecutive_missing_hardhat += 1
                        if profile.consecutive_missing_hardhat < self.persistence_threshold:
                            obs = PPEObservation(
                                ppe_type=PPEType.HARDHAT,
                                status=PPEStatus.UNCERTAIN,
                                confidence=round(person.confidence, 3),
                                uncertainty_reason=(
                                    f"Hardhat unconfirmed for {profile.consecutive_missing_hardhat} frames "
                                    f"(threshold={self.persistence_threshold})"
                                ),
                            )
                        else:
                            obs = PPEObservation(
                                ppe_type=PPEType.HARDHAT,
                                status=PPEStatus.NON_COMPLIANT,
                                confidence=round(person.confidence, 3),
                                uncertainty_reason=f"Hardhat persistently missing for {profile.consecutive_missing_hardhat} frames",
                            )

                            # Emit PPE_VIOLATION candidate if cooldown passed
                            if (
                                timestamp_ns - profile.last_violation_emitted_ns
                            ) > self.cooldown_ns:
                                event_id = generate_event_id("evt_ppe_helmet")
                                profile.last_violation_emitted_ns = timestamp_ns
                                profile.active_violation_type = PPEType.HARDHAT

                                candidate = SafetyEventCandidate(
                                    event_id=event_id,
                                    event_type=EventType.PPE_VIOLATION,
                                    severity=EventSeverity.HIGH,
                                    source_id=source_id,
                                    track_id=track_id,
                                    rule_id="RULE_PPE_REQUIRED_HARDHAT",
                                    rule_version="1.0.0",
                                    first_observation_ns=timestamp_ns
                                    - (profile.consecutive_missing_hardhat * 40_000_000),
                                    last_observation_ns=timestamp_ns,
                                    persistence_count=profile.consecutive_missing_hardhat,
                                    confidence=round(person.confidence, 3),
                                    deduplication_key=f"{source_id}:{track_id}:PPE:HARDHAT",
                                    supporting_detections=[person],
                                    metadata={
                                        "ppe_type": PPEType.HARDHAT.value,
                                        "consecutive_missing": profile.consecutive_missing_hardhat,
                                    },
                                )
                                events.append(candidate)
                                logger.warning(
                                    f"PPE Violation Candidate: Worker #{track_id} missing required hardhat "
                                    f"(frames={profile.consecutive_missing_hardhat})"
                                )

                observations[PPEType.HARDHAT] = obs

            # 2. SAFETY VEST EVALUATION
            if PPEType.SAFETY_VEST in required_ppe:
                if is_occluded:
                    obs_v = PPEObservation(
                        ppe_type=PPEType.SAFETY_VEST,
                        status=PPEStatus.OCCLUDED,
                        confidence=person.confidence,
                        uncertainty_reason="Worker bounding box occluded or low resolution",
                    )
                else:
                    torso_region = calculate_torso_region(person.bbox)
                    best_vest = None
                    best_overlap_v = 0.0

                    for v in vests:
                        overlap = compute_iou(torso_region, v.bbox)
                        if overlap > best_overlap_v:
                            best_overlap_v = overlap
                            best_vest = v

                    if best_vest and best_overlap_v >= self.overlap_threshold:
                        obs_v = PPEObservation(
                            ppe_type=PPEType.SAFETY_VEST,
                            status=PPEStatus.COMPLIANT,
                            confidence=round(best_vest.confidence, 3),
                            matched_detection=best_vest,
                        )
                        profile.consecutive_missing_vest = 0
                    else:
                        profile.consecutive_missing_vest += 1
                        if profile.consecutive_missing_vest < self.persistence_threshold:
                            obs_v = PPEObservation(
                                ppe_type=PPEType.SAFETY_VEST,
                                status=PPEStatus.UNCERTAIN,
                                confidence=round(person.confidence, 3),
                                uncertainty_reason=(
                                    f"Safety vest unconfirmed for {profile.consecutive_missing_vest} frames "
                                    f"(threshold={self.persistence_threshold})"
                                ),
                            )
                        else:
                            obs_v = PPEObservation(
                                ppe_type=PPEType.SAFETY_VEST,
                                status=PPEStatus.NON_COMPLIANT,
                                confidence=round(person.confidence, 3),
                                uncertainty_reason=f"Safety vest persistently missing for {profile.consecutive_missing_vest} frames",
                            )

                            if (
                                timestamp_ns - profile.last_violation_emitted_ns
                            ) > self.cooldown_ns:
                                event_id = generate_event_id("evt_ppe_vest")
                                profile.last_violation_emitted_ns = timestamp_ns
                                profile.active_violation_type = PPEType.SAFETY_VEST

                                candidate = SafetyEventCandidate(
                                    event_id=event_id,
                                    event_type=EventType.PPE_VIOLATION,
                                    severity=EventSeverity.MEDIUM,
                                    source_id=source_id,
                                    track_id=track_id,
                                    rule_id="RULE_PPE_REQUIRED_VEST",
                                    rule_version="1.0.0",
                                    first_observation_ns=timestamp_ns
                                    - (profile.consecutive_missing_vest * 40_000_000),
                                    last_observation_ns=timestamp_ns,
                                    persistence_count=profile.consecutive_missing_vest,
                                    confidence=round(person.confidence, 3),
                                    deduplication_key=f"{source_id}:{track_id}:PPE:VEST",
                                    supporting_detections=[person],
                                    metadata={
                                        "ppe_type": PPEType.SAFETY_VEST.value,
                                        "consecutive_missing": profile.consecutive_missing_vest,
                                    },
                                )
                                events.append(candidate)
                                logger.warning(
                                    f"PPE Violation Candidate: Worker #{track_id} missing required safety vest "
                                    f"(frames={profile.consecutive_missing_vest})"
                                )

                observations[PPEType.SAFETY_VEST] = obs_v

            profile.history.append(observations)
            frame_results[track_id] = observations

        return frame_results, events
