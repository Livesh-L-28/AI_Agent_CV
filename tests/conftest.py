"""
Pytest fixtures for SENTINEL AI test suite.
"""

from pathlib import Path
from typing import Generator

import pytest

from sentinel.config import Settings, get_settings


@pytest.fixture(autouse=True)
def clean_environment(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> Generator[None, None, None]:
    """Ensures each test operates with clean environment variables and temporary paths."""
    # Reset cached settings
    get_settings.cache_clear()

    # Point storage to tmp_path
    monkeypatch.setenv("EVIDENCE_STORAGE_PATH", str(tmp_path / "evidence"))
    monkeypatch.setenv("UPLOAD_STORAGE_PATH", str(tmp_path / "uploads"))
    monkeypatch.setenv("FIXTURES_PATH", str(tmp_path / "fixtures"))
    monkeypatch.setenv("DATABASE_URL", f"sqlite+aiosqlite:///{tmp_path}/test_sentinel.db")
    monkeypatch.setenv("ENVIRONMENT", "testing")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")

    yield

    get_settings.cache_clear()


@pytest.fixture
def test_settings(tmp_path: Path) -> Settings:
    """Provides a fresh Settings instance pointed at a temporary directory."""
    return Settings(
        environment="testing",
        evidence_storage_path=tmp_path / "evidence",
        upload_storage_path=tmp_path / "uploads",
        fixtures_path=tmp_path / "fixtures",
        database_url=f"sqlite+aiosqlite:///{tmp_path}/test_sentinel.db",
    )
