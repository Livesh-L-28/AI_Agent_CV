"""
Typed Shared State Schemas for the Sentinel AI Multi-Agent Workflow.
"""

from typing import Any, Optional

from pydantic import BaseModel, Field

from sentinel.rules.types import SafetyEventCandidate


class InvestigationResult(BaseModel):
    """Output produced by Agent A: Event Investigator."""

    summary: str
    cited_evidence_ids: list[str] = Field(default_factory=list)
    is_sufficient_evidence: bool = True
    missing_evidence: list[str] = Field(default_factory=list)
    risk_assessment: str


class PolicyResult(BaseModel):
    """Output produced by Agent B: Deterministic Policy Evaluator."""

    is_policy_violated: bool
    policy_rule_id: str
    deterministic_severity: str
    recommended_action: str
    rejection_reason: Optional[str] = None


class ActionRequest(BaseModel):
    """Request from Agent C: Response Agent to execute an allowlisted tool."""

    tool_name: str
    parameters: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str


class ActionResult(BaseModel):
    """Actual outcome of a tool execution verified by the tool service."""

    tool_name: str
    status: str  # "SUCCESS", "FAILED", "REJECTED_UNAUTHORIZED", "ALREADY_EXISTS"
    output: dict[str, Any] = Field(default_factory=dict)
    error: Optional[str] = None


class VerificationResult(BaseModel):
    """Output produced by Agent D: Verification Agent."""

    is_verified: bool
    verification_status: str  # "VERIFIED_SUCCESS", "FAILED_TOOL", "PARTIAL_SUCCESS"
    incident_confirmed: bool = False
    notification_confirmed: bool = False
    audit_evidence: str


class AgentState(BaseModel):
    """Shared typed state flowing across all 4 agent stages."""

    event_candidate: SafetyEventCandidate
    correlation_id: str

    investigation: Optional[InvestigationResult] = None
    policy_result: Optional[PolicyResult] = None
    action_requests: list[ActionRequest] = Field(default_factory=list)
    action_results: list[ActionResult] = Field(default_factory=list)
    verification: Optional[VerificationResult] = None

    current_stage: str = "INITIAL"
    retry_count: int = 0
    errors: list[str] = Field(default_factory=list)
    is_degraded_mode: bool = False
