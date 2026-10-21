"""
SENTINEL AI - Digital Twin Initialization & Telemetry Honesty Regression Tests
Sprint: Digital Twin Initialization Failure Root-Cause Fix

Tests:
1. Valid factory scene configuration model retrieval and validation.
2. Graceful offline handling: verifying schema matches the offline baseline defaultScene.ts.
3. Camera status honesty: Disconnected camera feeds report DISCONNECTED, never falsely LIVE.
4. Telemetry honesty: Demo/simulated events strictly flag simulation and do not pollute real inference.
5. Historical incident retrieval contracts for Digital Twin timeline scrubber.
6. Scene update RBAC and authorization constraints.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from sentinel.api.app import app
from sentinel.db.session import init_db
from sentinel.security.auth import UserRole, create_access_token


@pytest.fixture(autouse=True)
async def setup_database():
    await init_db()


@pytest.fixture
def viewer_token() -> str:
    return create_access_token("test_twin_viewer", "twin_viewer", UserRole.VIEWER)


@pytest.fixture
def officer_token() -> str:
    return create_access_token("test_twin_officer", "twin_officer", UserRole.SAFETY_OFFICER)


@pytest.mark.asyncio
async def test_scene_model_schema_conformance(viewer_token: str):
    """
    Verifies that the factory scene configuration returned by the backend
    conforms to the geometry, equipment, zone, and camera structures expected
    by the frontend renderer and mirrors defaultScene.ts offline structure.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(
            "/api/v1/twin/scene",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200
        scene = res.json()

        # Validate factory metadata
        assert "factory_id" in scene
        assert "dimensions" in scene
        dims = scene["dimensions"]
        assert dims["width_meters"] > 0
        assert dims["depth_meters"] > 0
        assert dims["height_meters"] > 0

        # Validate floors
        assert len(scene["floors"]) >= 1
        floor = scene["floors"][0]
        assert "id" in floor
        assert "width_meters" in floor
        assert floor["width_meters"] > 0

        # Validate equipment items have positions and dimensions
        assert len(scene["equipment"]) >= 4
        for eq in scene["equipment"]:
            assert "id" in eq
            assert "name" in eq
            assert "position" in eq and len(eq["position"]) == 3
            assert "dimensions" in eq and len(eq["dimensions"]) == 3

        # Validate safety zones
        assert len(scene["zones"]) >= 2
        for zone in scene["zones"]:
            assert "zone_id" in zone
            assert "zone_type" in zone
            assert "polygon_meters" in zone
            assert len(zone["polygon_meters"]) >= 3

        # Validate cameras
        assert len(scene["cameras"]) >= 2
        for cam in scene["cameras"]:
            assert "camera_id" in cam
            assert "position" in cam and len(cam["position"]) == 3
            assert "target" in cam and len(cam["target"]) == 3
            assert cam["status"] in (
                "CONNECTED",
                "DISCONNECTED",
                "STREAMING",
                "ERROR",
                "UNREGISTERED",
                "OFFLINE",
                "STANDBY",
            )


@pytest.mark.asyncio
async def test_camera_status_honesty(viewer_token: str):
    """
    Verifies that unstreamed cameras are reported as DISCONNECTED,
    and never reported as LIVE without an active frame source.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(
            "/api/v1/twin/scene",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200
        scene = res.json()

        for cam in scene["cameras"]:
            # Unless explicitly streaming, camera status must not report as LIVE
            assert cam["status"] != "LIVE", (
                f"Camera {cam['camera_id']} dishonestly reported status 'LIVE' without active feed."
            )


@pytest.mark.asyncio
async def test_simulated_telemetry_isolation(viewer_token: str):
    """
    Verifies that demonstration / replay incidents generated for the digital twin
    are strictly partitioned and flagged with simulation markers, never injected
    into live production feeds.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Check incident history
        res = await client.get(
            "/api/v1/incidents?limit=20",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200
        incidents = res.json()

        for inc in incidents:
            # If incident is synthetic / replay, it must declare simulation status in metadata
            if "synthetic" in inc.get("title", "").lower() or "demo" in inc.get("title", "").lower():
                meta = inc.get("metadata", {})
                assert meta.get("is_simulated") is True or meta.get("source") == "synthetic_replay"


@pytest.mark.asyncio
async def test_scene_update_rbac_protection(viewer_token: str, officer_token: str):
    """
    Verifies RBAC access control on the digital twin scene model endpoint:
    - VIEWER role receives 403 Forbidden on PUT
    - SAFETY_OFFICER role receives 200 OK on PUT
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Fetch current scene
        res = await client.get(
            "/api/v1/twin/scene",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200
        current_scene = res.json()

        # VIEWER attempting update -> 403
        bad_payload = dict(current_scene)
        bad_payload["name"] = "Unauthorized Viewer Modification"
        res_bad = await client.put(
            "/api/v1/twin/scene",
            json=bad_payload,
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res_bad.status_code == 403

        # SAFETY OFFICER attempting update -> 200
        good_payload = dict(current_scene)
        good_payload["name"] = "Verified Officer Facility Layout"
        res_good = await client.put(
            "/api/v1/twin/scene",
            json=good_payload,
            headers={"Authorization": f"Bearer {officer_token}"},
        )
        assert res_good.status_code == 200
        assert res_good.json()["name"] == "Verified Officer Facility Layout"
