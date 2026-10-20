"""
Deterministic Mock LLM Provider for unit testing and offline degraded execution.
"""

import asyncio
from typing import Any, Optional

from sentinel.agents.providers.base import BaseLLMProvider


class DeterministicMockProvider(BaseLLMProvider):
    def __init__(
        self,
        simulate_malformed: bool = False,
        simulate_timeout: bool = False,
    ) -> None:
        self.simulate_malformed = simulate_malformed
        self.simulate_timeout = simulate_timeout

    @property
    def provider_name(self) -> str:
        return "mock"

    @property
    def model_name(self) -> str:
        return "mock-deterministic-v1"

    async def generate_structured(
        self,
        prompt: str,
        system_instruction: str,
        json_schema: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        if self.simulate_timeout:
            await asyncio.sleep(0.5)
            raise TimeoutError("Simulated LLM provider timeout")

        if self.simulate_malformed:
            return {"corrupted_payload": True}

        # Deterministic evidence extraction from prompt
        return {
            "summary": "Verified entity presence in safety-critical zone based on tracked trajectory.",
            "cited_evidence_ids": ["det_0", "det_1"],
            "is_sufficient_evidence": True,
            "missing_evidence": [],
            "risk_assessment": "High probability of severe hazard from automated machinery.",
            "recommended_action": "CREATE_INCIDENT_AND_ALERT",
        }
