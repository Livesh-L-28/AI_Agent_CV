"""
Unit tests for sentinel.config
"""

import pytest
from pydantic import ValidationError

from sentinel.config import Settings, get_settings


def test_default_settings():
    settings = Settings()
    assert settings.environment in ["development", "testing", "staging", "production"]
    assert 0.0 <= settings.yolo_confidence_threshold <= 1.0
    assert 0.0 <= settings.yolo_iou_threshold <= 1.0
    assert settings.zone_persistence_frames >= 1
    assert settings.ppe_persistence_frames >= 1
    assert settings.event_cooldown_seconds >= 0.0


def test_allowed_origins_parsing():
    settings = Settings(
        allowed_origins="http://localhost:3000, http://localhost:5173 , https://sentinel.internal"
    )
    origins = settings.allowed_origins_list
    assert origins == [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://sentinel.internal",
    ]


def test_invalid_log_level():
    with pytest.raises(ValidationError):
        Settings(log_level="VERBOSE")


def test_resolve_yolo_device_explicit():
    settings_cpu = Settings(yolo_device="cpu")
    assert settings_cpu.resolve_yolo_device() == "cpu"

    settings_mps = Settings(yolo_device="mps")
    assert settings_mps.resolve_yolo_device() == "mps"


def test_resolve_yolo_device_auto():
    settings = Settings(yolo_device="auto")
    device = settings.resolve_yolo_device()
    assert device in ["cpu", "mps", "cuda"]


def test_ensure_storage_dirs(tmp_path):
    settings = Settings(
        evidence_storage_path=tmp_path / "sub" / "evidence",
        upload_storage_path=tmp_path / "sub" / "uploads",
        fixtures_path=tmp_path / "sub" / "fixtures",
    )
    settings.ensure_storage_dirs()
    assert settings.evidence_storage_path.is_dir()
    assert settings.upload_storage_path.is_dir()
    assert settings.fixtures_path.is_dir()


def test_cached_get_settings():
    s1 = get_settings()
    s2 = get_settings()
    assert s1 is s2
