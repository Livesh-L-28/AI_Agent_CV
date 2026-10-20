"""
LLM Providers Package
"""

from sentinel.agents.providers.base import BaseLLMProvider
from sentinel.agents.providers.mock import DeterministicMockProvider
from sentinel.agents.providers.ollama import OllamaProvider
from sentinel.config import get_settings


def get_llm_provider(force_mock: bool = False) -> BaseLLMProvider:
    """Returns the configured LLM provider or deterministic mock."""
    settings = get_settings()
    if force_mock or settings.enable_mock_llm or settings.llm_provider == "mock":
        return DeterministicMockProvider()
    return OllamaProvider(base_url=settings.ollama_base_url, model=settings.ollama_model)


__all__ = [
    "BaseLLMProvider",
    "OllamaProvider",
    "DeterministicMockProvider",
    "get_llm_provider",
]
