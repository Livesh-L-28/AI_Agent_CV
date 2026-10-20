"""
Base LLM Provider Interface.
"""

from abc import ABC, abstractmethod
from typing import Any, Optional


class BaseLLMProvider(ABC):
    @property
    @abstractmethod
    def provider_name(self) -> str:
        pass

    @property
    @abstractmethod
    def model_name(self) -> str:
        pass

    @abstractmethod
    async def generate_structured(
        self,
        prompt: str,
        system_instruction: str,
        json_schema: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Generates a structured dictionary conforming to the requested schema."""
        pass
