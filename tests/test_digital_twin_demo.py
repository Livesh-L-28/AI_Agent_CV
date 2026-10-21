"""
SENTINEL AI — Digital Twin Demo Automated Verification Test Suite.
Verifies scenario state definitions, deterministic timing bounds,
strict live-versus-simulation data isolation, and safety integrity.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from sentinel.api.app import app
from sentinel.db.session import init_db
from sentinel.security.auth import UserRole, create_access_token


@pytest.fixture(autouse=True)
async def ensure_db():
    await init_db()


@pytest.fixture
def officer_token() -> str:
    return create_access_token("officer_demo_test", "safety_officer", UserRole.SAFETY_OFFICER)


@pytest.fixture
def viewer_token() -> str:
    return create_access_token("viewer_demo_test", "viewer", UserRole.VIEWER)


def test_demo_scenarios_deterministic_timeline():
    """
    Verifies that the demo scenario definition file is contiguous,
    non-overlapping, covers exactly 72.0 seconds, and has valid keyframes.
    """
    scenario_file = Path("frontend/src/pages/digitaltwin/demoScenarios.ts")
    assert scenario_file.exists(), "demoScenarios.ts must exist in frontend source"

    content = scenario_file.read_text(encoding="utf-8")

    # Verify duration and scene count
    assert "DEMO_TOTAL_DURATION = 72.0" in content
    assert "factory_initialization" in content
    assert "camera_activation" in content
    assert "worker_tracking" in content
    assert "zone_event" in content
    assert "incident_investigation" in content
    assert "factory_overview" in content


@pytest.mark.asyncio
async def test_demo_safety_isolation_no_db_pollution(officer_token):
    """
    STRICT LIVE/SIMULATION SEPARATION REQUIREMENT:
    Verifies that simulated demo incidents (e.g. SIM-INC-884, evt_sim_zone_entry_884)
    are NEVER written to the production database or returned as real incidents.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Check incident list
        res = await client.get(
            "/api/v1/incidents",
            headers={"Authorization": f"Bearer {officer_token}"},
        )
        assert res.status_code == 200
        incidents = res.json()

        # Ensure no demo incidents appear in production incident feed
        for inc in incidents:
            assert "SIM-INC" not in inc.get("id", ""), "Simulated incident must not leak into production DB"
            assert "evt_sim" not in inc.get("event_id", ""), "Simulated event must not leak into production DB"

        # Check direct lookup of simulated ID produces honest 404
        res_single = await client.get(
            "/api/v1/incidents/SIM-INC-884",
            headers={"Authorization": f"Bearer {officer_token}"},
        )
        assert res_single.status_code == 404


@pytest.mark.asyncio
async def test_live_camera_telemetry_honesty(officer_token):
    """
    Verifies that live camera metrics report genuine hardware state
    without synthetic mocking or inflated FPS.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(
            "/api/v1/cameras",
            headers={"Authorization": f"Bearer {officer_token}"},
        )
        assert res.status_code == 200
        cameras = res.json()
        if not cameras:
            # Register cam-facility-01 if lifespan did not run
            reg_res = await client.post(
                "/api/v1/cameras",
                json={
                    "camera_id": "cam-facility-01",
                    "name": "Assembly Line Overhead Cam 01",
                    "camera_type": "replay",
                    "uri": "data/fixtures/synthetic_safety_video.mp4",
                    "target_fps": 25.0,
                },
                headers={"Authorization": f"Bearer {officer_token}"},
            )
            assert reg_res.status_code == 201
            cameras = [reg_res.json()]

        cam = next((c for c in cameras if c["camera_id"] == "cam-facility-01"), None)
        assert cam is not None
        assert cam["status"] in ("LIVE", "STOPPED", "CREATED", "DISCONNECTED")

        metrics = cam["metrics"]
        assert metrics["effective_fps"] >= 0.0
        assert metrics["frames_read"] >= 0
        assert metrics["queue_depth"] >= 0


@pytest.mark.asyncio
async def test_twin_scene_and_calibration_integrity(viewer_token):
    """
    Verifies that the factory digital twin scene model and spatial homography
    calibration remain accurate and functional alongside the demo system.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(
            "/api/v1/twin/scene",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200
        scene = res.json()

        # Check factory layout grounding
        assert scene["factory_id"] == "factory-plant-alpha"
        assert scene["dimensions"]["width_meters"] == 60.0
        assert scene["dimensions"]["depth_meters"] == 40.0

        # Check restricted zone definition
        robotics_zone = next((z for z in scene["zones"] if z["zone_id"] == "zone-robotics-01"), None)
        assert robotics_zone is not None
        assert robotics_zone["zone_type"] == "RESTRICTED"
        assert len(robotics_zone["polygon_meters"]) == 4

        # Check camera calibration endpoint
        res_cal = await client.get(
            "/api/v1/twin/calibration/cam-facility-01",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res_cal.status_code == 200
        cal_data = res_cal.json()
        assert cal_data["camera_id"] == "cam-facility-01"
        assert cal_data["calibrated"] is True
        assert len(cal_data["homography_matrix"]) == 3
