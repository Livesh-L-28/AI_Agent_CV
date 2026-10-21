"""
SENTINEL AI Configuration Module
Provides typed, validated configuration loading from environment variables.
"""

from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # General Environment
    environment: Literal["development", "testing", "staging", "production"] = "development"
    log_level: str = "INFO"
    debug: bool = False

    # Database Configuration (SQLite default for zero-setup local dev/test; PostgreSQL for production)
    database_url: str = "sqlite+aiosqlite:///./sentinel.db"

    # Computer Vision & Model Inference
    yolo_model_path: str = "yolov8n.pt"
    yolo_confidence_threshold: float = Field(default=0.35, ge=0.0, le=1.0)
    yolo_iou_threshold: float = Field(default=0.45, ge=0.0, le=1.0)
    yolo_device: str = "auto"  # "auto", "cpu", "mps", "cuda"
    inference_image_size: int = 640
    enable_camera_autostart: bool = False

    # Temporal Rules & Safety Thresholds
    zone_persistence_frames: int = Field(default=5, ge=1)
    ppe_persistence_frames: int = Field(default=6, ge=1)
    event_cooldown_seconds: float = Field(default=10.0, ge=0.0)

    # LLM & Multi-Agent Configuration
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:3b"
    openai_api_key: Optional[str] = None
    llm_provider: Literal["ollama", "openai", "mock"] = "ollama"
    enable_mock_llm: bool = False
    agent_max_retries: int = 2
    agent_timeout_seconds: float = 15.0

    # Storage Paths
    evidence_storage_path: Path = Path("./data/evidence")
    upload_storage_path: Path = Path("./data/uploads")
    fixtures_path: Path = Path("./data/fixtures")

    # API Server Configuration
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    allowed_origins: str = "http://localhost:3000,http://localhost:5173"

    # Authentication & Security Configuration (Sprint 1A / DEF-01)
    jwt_secret_key: Optional[str] = None
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_issuer: str = "sentinel-auth"
    jwt_audience: str = "sentinel-api"

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        valid_levels = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in valid_levels:
            raise ValueError(f"Invalid log_level '{v}'. Must be one of {valid_levels}")
        return upper

    @property
    def allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",") if origin.strip()]

    def resolve_yolo_device(self) -> str:
        """
        Determines the appropriate device backend.
        Defaults to CPU if auto-detection finds neither CUDA nor MPS.
        """
        if self.yolo_device != "auto":
            return self.yolo_device

        try:
            import torch

            if torch.cuda.is_available():
                return "cuda"
            if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
                return "mps"
        except ImportError:
            pass
        return "cpu"

    def validate_auth_secrets(self) -> None:
        """
        Validates authentication configuration and signing secrets.
        Fails startup immediately if required secrets are missing or unsafe in protected environments.
        """
        insecure_keys = {"insecure-secret", "changeme", "secret", "default", "development-secret-key-sentinel"}
        if self.environment in ("production", "staging"):
            if not self.jwt_secret_key:
                raise ValueError(
                    f"CRITICAL SECURITY CONFIGURATION ERROR: 'jwt_secret_key' is required in {self.environment} mode."
                )
            if self.jwt_secret_key.lower() in insecure_keys:
                raise ValueError(
                    f"CRITICAL SECURITY CONFIGURATION ERROR: 'jwt_secret_key' uses an unsafe/known default in {self.environment} mode."
                )
            if len(self.jwt_secret_key) < 32:
                raise ValueError(
                    f"CRITICAL SECURITY CONFIGURATION ERROR: 'jwt_secret_key' must be at least 32 characters in {self.environment} mode."
                )

    def get_jwt_secret_key(self) -> str:
        """Returns verified JWT signing secret, using a safe ephemeral development secret if in dev/test."""
        self.validate_auth_secrets()
        if self.jwt_secret_key:
            return self.jwt_secret_key
        # Ephemeral secret for zero-configuration local dev/test only
        return "sentinel-insecure-dev-secret-key-32chars!!"

    def ensure_storage_dirs(self) -> None:
        """Creates required media storage directories if they do not exist."""
        self.evidence_storage_path.mkdir(parents=True, exist_ok=True)
        self.upload_storage_path.mkdir(parents=True, exist_ok=True)
        self.fixtures_path.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Returns a cached instance of application settings."""
    settings = Settings()
    settings.ensure_storage_dirs()
    return settings
