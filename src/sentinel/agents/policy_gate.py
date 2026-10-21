"""
Deterministic Safety Policy Gate.
Enforces hard-coded safety rules and prevents probabilistic LLM hallucinations
from dismissing or overriding verified industrial violations.
"""

from sentinel.agents.state import AgentState, PolicyResult
from sentinel.logging import setup_logging
from sentinel.rules.types import EventType

logger = setup_logging()


def evaluate_policy(state: AgentState) -> PolicyResult:
    """
    Evaluates policy rules deterministically against candidate evidence.
    This gate cannot be overturned by an LLM.
    """
    event = state.event_candidate

    # 1. Restricted Zone Violations
    if event.event_type == EventType.ZONE_ENTRY:
        if event.persistence_count >= 5:
            return PolicyResult(
                is_policy_violated=True,
                policy_rule_id=event.rule_id,
                deterministic_severity=event.severity.value,
                recommended_action="CREATE_INCIDENT_AND_ALERT",
            )
        else:
            return PolicyResult(
                is_policy_violated=False,
                policy_rule_id=event.rule_id,
                deterministic_severity="LOW",
                recommended_action="LOG_ONLY",
                rejection_reason="Persistence count below configured minimum 5 frames",
            )

    # 2. PPE Violations
    if event.event_type == EventType.PPE_VIOLATION:
        if event.persistence_count >= 6:
            return PolicyResult(
                is_policy_violated=True,
                policy_rule_id=event.rule_id,
                deterministic_severity=event.severity.value,
                recommended_action="CREATE_INCIDENT_AND_ALERT",
            )
        else:
            return PolicyResult(
                is_policy_violated=False,
                policy_rule_id=event.rule_id,
                deterministic_severity="LOW",
                recommended_action="LOG_ONLY",
                rejection_reason="PPE dropout below temporal threshold",
            )

    # 2b. Unsafe Proximity Violations
    if event.event_type == EventType.UNSAFE_PROXIMITY:
        if event.persistence_count >= 3:
            return PolicyResult(
                is_policy_violated=True,
                policy_rule_id=event.rule_id,
                deterministic_severity=event.severity.value,
                recommended_action="CREATE_INCIDENT_AND_ALERT",
            )
        else:
            return PolicyResult(
                is_policy_violated=False,
                policy_rule_id=event.rule_id,
                deterministic_severity="LOW",
                recommended_action="LOG_ONLY",
                rejection_reason="Proximity duration below temporal threshold",
            )

    # 3. Zone Exits and Normal Lifecycle
    if event.event_type == EventType.ZONE_EXIT:
        return PolicyResult(
            is_policy_violated=False,
            policy_rule_id=event.rule_id,
            deterministic_severity="INFO",
            recommended_action="LOG_ONLY",
        )

    # Default fallback
    return PolicyResult(
        is_policy_violated=False,
        policy_rule_id=event.rule_id,
        deterministic_severity="LOW",
        recommended_action="LOG_ONLY",
        rejection_reason="Event type did not match safety violation criteria",
    )
