"""
Ollama Local LLM Provider.
Integrates with local Ollama server running llama3.2:3b with structured JSON generation.
"""

import json
from typing import Any, Optional

import httpx

from sentinel.agents.providers.base import BaseLLMProvider
from sentinel.config import get_settings
from sentinel.logging import setup_logging

logger = setup_logging()


class OllamaProvider(BaseLLMProvider):
    def __init__(
        self,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 15.0,
    ) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.model = model or settings.ollama_model
        self.timeout = timeout

    @property
    def provider_name(self) -> str:
        return "ollama"

    @property
    def model_name(self) -> str:
        return self.model

    async def generate_structured(
        self,
        prompt: str,
        system_instruction: str,
        json_schema: Optional[dict[str, Any]] = None,
    ) -> dict[str, Any]:
        """Calls Ollama HTTP API requesting JSON structured completion."""
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "system": system_instruction,
            "format": "json",
            "stream": False,
            "options": {
                "temperature": 0.1,  # Low temperature for deterministic evidence reasoning
            },
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()
                response_text = data.get("response", "{}")
                return json.loads(response_text)
            except (httpx.RequestError, httpx.HTTPStatusError, json.JSONDecodeError) as e:
                logger.error(f"Ollama provider generation error: {e}")
                raise RuntimeError(f"Ollama generation failed: {e}") from e
