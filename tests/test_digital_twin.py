"""
Automated Regression Test Suite for SENTINEL AI Operational Digital Twin.
Tests scene model validation, RBAC, camera calibration workflows,
homography coordinate transforms, historical replay timelines, and stream telemetry.
"""

import pytest
from httpx import ASGITransport, AsyncClient

from sentinel.api.app import app
from sentinel.api.routers import twin
from sentinel.db.session import init_db
from sentinel.security.auth import UserRole, create_access_token
from sentinel.vision.geometry import PlanarHomography


@pytest.fixture(autouse=True)
async def setup_database():
    await init_db()
    twin._ACTIVE_SCENE = None
    yield
    twin._ACTIVE_SCENE = None


@pytest.fixture
def viewer_token() -> str:
    return create_access_token("twin_viewer", "viewer", UserRole.VIEWER)


@pytest.fixture
def officer_token() -> str:
    return create_access_token("twin_officer", "officer", UserRole.SAFETY_OFFICER)


@pytest.mark.asyncio
async def test_factory_scene_model_retrieval_and_rbac(viewer_token, officer_token):
    """
    Validates factory scene model retrieval and RBAC protection:
    - Viewers can read scene model
    - Viewers cannot update scene model (403 Forbidden)
    - Safety Officers can update scene model (200 OK)
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Viewer can retrieve active scene model
        res_view = await client.get(
            "/api/v1/twin/scene",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res_view.status_code == 200
        scene = res_view.json()
        assert scene["schema_version"] == "1.0.0"
        assert scene["factory_id"] == "factory-plant-alpha"
        assert len(scene["floors"]) >= 1
        assert len(scene["equipment"]) >= 4
        assert len(scene["zones"]) >= 2
        assert len(scene["cameras"]) >= 2

        # 2. Viewer updating scene is rejected with 403 Forbidden
        update_payload = dict(scene)
        update_payload["name"] = "Unauthorized Name Change"
        res_unauth = await client.put(
            "/api/v1/twin/scene",
            json=update_payload,
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res_unauth.status_code == 403

        # 3. Safety Officer updating scene is accepted with 200 OK
        update_payload["name"] = "Authorized Facility Update"
        res_auth = await client.put(
            "/api/v1/twin/scene",
            json=update_payload,
            headers={"Authorization": f"Bearer {officer_token}"},
        )
        assert res_auth.status_code == 200
        assert res_auth.json()["name"] == "Authorized Facility Update"
        assert res_auth.json()["updated_by"] == "officer"


@pytest.mark.asyncio
async def test_camera_calibration_workflow_and_validation(viewer_token, officer_token):
    """
    Verifies camera calibration retrieval, correspondence submission,
    collinearity rejection, and homography matrix validation.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Uncalibrated camera reports CALIBRATION_PENDING
        res_uncal = await client.get(
            "/api/v1/twin/calibration/cam-browser-01",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res_uncal.status_code == 200
        data_uncal = res_uncal.json()
        assert data_uncal["calibrated"] is False
        assert data_uncal["validation_status"] == "CALIBRATION_PENDING"

        # 2. Reject mismatched correspondence counts (HTTP 400)
        res_mismatch = await client.post(
            "/api/v1/twin/calibration/cam-browser-01",
            json={
                "camera_id": "cam-browser-01",
                "image_points": [[0.2, 0.2], [0.8, 0.2]],
                "ground_points": [[10.0, 10.0]],
            },
            headers={"Authorization": f"Bearer {officer_token}"},
        )
        assert res_mismatch.status_code == 400
        assert "Mismatched correspondence counts" in res_mismatch.json()["detail"]

        # 3. Reject degenerate collinear point triplet (HTTP 400)
        res_collinear = await client.post(
            "/api/v1/twin/calibration/cam-browser-01",
            json={
                "camera_id": "cam-browser-01",
                "image_points": [[0.1, 0.1], [0.2, 0.2], [0.3, 0.3], [0.5, 0.8]],
                "ground_points": [[10.0, 10.0], [20.0, 20.0], [30.0, 30.0], [50.0, 80.0]],
            },
            headers={"Authorization": f"Bearer {officer_token}"},
        )
        assert res_collinear.status_code == 400
        assert "collinear" in res_collinear.json()["detail"].lower()

        # 4. Valid non-collinear 4-point correspondence succeeds
        valid_img_pts = [[0.1, 0.2], [0.9, 0.2], [0.85, 0.85], [0.15, 0.85]]
        valid_ground_pts = [[10.0, 10.0], [30.0, 10.0], [30.0, 25.0], [10.0, 25.0]]

        res_cal = await client.post(
            "/api/v1/twin/calibration/cam-browser-01",
            json={
                "camera_id": "cam-browser-01",
                "image_points": valid_img_pts,
                "ground_points": valid_ground_pts,
            },
            headers={"Authorization": f"Bearer {officer_token}"},
        )
        assert res_cal.status_code == 200
        data_cal = res_cal.json()
        assert data_cal["calibrated"] is True
        assert data_cal["validation_status"] == "VALIDATED"
        assert len(data_cal["homography_matrix"]) == 3
        assert len(data_cal["homography_matrix"][0]) == 3


def test_homography_coordinate_transform_mathematics():
    """
    Direct mathematical validation of PlanarHomography:
    - Forward mapping from normalized camera space (u, v) to metric ground space (X, Y)
    - Inverse mapping from metric ground space (X, Y) back to camera sensor (u, v)
    - Detection of projective horizon singularity
    """
    img_pts = [(0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9)]
    ground_pts = [(5.0, 5.0), (45.0, 5.0), (45.0, 35.0), (5.0, 35.0)]

    h = PlanarHomography.from_correspondences(img_pts, ground_pts)

    # 1. Forward transformation of known correspondence
    gx, gy = h.transform_point((0.1, 0.1))
    assert pytest.approx(gx, abs=1e-3) == 5.0
    assert pytest.approx(gy, abs=1e-3) == 5.0

    # 2. Center point maps to center of ground plane
    cx, cy = h.transform_point((0.5, 0.5))
    assert pytest.approx(cx, abs=1e-2) == 25.0
    assert pytest.approx(cy, abs=1e-2) == 20.0

    # 3. Inverse transformation recovers original pixel coordinate
    ix, iy = h.inverse_transform_point((25.0, 20.0))
    assert pytest.approx(ix, abs=1e-3) == 0.5
    assert pytest.approx(iy, abs=1e-3) == 0.5

    # 4. Out of bounds non-finite input rejected
    with pytest.raises(ValueError):
        h.transform_point((float("nan"), 0.5))


@pytest.mark.asyncio
async def test_historical_replay_timeline_endpoint(viewer_token):
    """
    Validates historical replay timeline retrieval for Digital Twin playback.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(
            "/api/v1/twin/replay",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200
        data = res.json()
        assert data["is_replay"] is True
        assert "timeline" in data
        assert isinstance(data["timeline"], list)


@pytest.mark.asyncio
async def test_multi_twin_environments_catalogue(viewer_token):
    """
    Validates that the Digital Twin Center returns all 4 distinct industrial environments
    with complete metadata and capability declarations.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.get(
            "/api/v1/twin/environments",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res.status_code == 200
        envs = res.json()
        assert len(envs) == 4

        env_ids = [e["id"] for e in envs]
        assert "manufacturing-plant" in env_ids
        assert "warehouse-logistics" in env_ids
        assert "process-chemical" in env_ids
        assert "construction-site" in env_ids

        # Validate each environment has distinct dimensions, capabilities, and camera counts
        for env in envs:
            assert env["dimensions"]["width_meters"] > 0
            assert env["dimensions"]["depth_meters"] > 0
            assert env["dimensions"]["height_meters"] > 0
            assert env["camera_count"] >= 1
            assert env["zone_count"] >= 1
            assert env["equipment_count"] >= 3
            assert len(env["supported_capabilities"]) >= 3
            assert env["status"] == "DEMO_BENCHMARK"


@pytest.mark.asyncio
async def test_multi_twin_distinct_scene_retrieval(viewer_token):
    """
    Validates that retrieving scenes by environment_id returns distinct physical geometry,
    equipment models, and safety zones.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Warehouse scene
        res_wh = await client.get(
            "/api/v1/twin/scene?environment_id=warehouse-logistics",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res_wh.status_code == 200
        wh_scene = res_wh.json()
        assert wh_scene["factory_id"] == "factory-warehouse-omega"
        assert wh_scene["dimensions"]["width_meters"] == 70.0
        assert any(eq["category"] == "WAREHOUSE_RACK" for eq in wh_scene["equipment"])

        # 2. Chemical scene
        res_chem = await client.get(
            "/api/v1/twin/scene?environment_id=process-chemical",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res_chem.status_code == 200
        chem_scene = res_chem.json()
        assert chem_scene["factory_id"] == "factory-petrochem-gulf"
        assert chem_scene["dimensions"]["height_meters"] == 14.0
        assert any(eq["category"] == "CHEMICAL_TANK" for eq in chem_scene["equipment"])

        # 3. Construction scene
        res_const = await client.get(
            "/api/v1/twin/scene?environment_id=construction-site",
            headers={"Authorization": f"Bearer {viewer_token}"},
        )
        assert res_const.status_code == 200
        const_scene = res_const.json()
        assert const_scene["factory_id"] == "factory-construction-metro"
        assert const_scene["dimensions"]["height_meters"] == 16.0
        assert any(eq["category"] == "TOWER_CRANE" for eq in const_scene["equipment"])


@pytest.mark.asyncio
async def test_walkthrough_analyze_endpoint(viewer_token):
    """
    Validates manual walkthrough spatial analysis:
    - Normal coordinates (safe walkway) returns is_violation=False
    - Coordinates inside Assembly Cell B Exclusion Zone (32.38, 14.20) returns is_violation=True,
      creates SafetyEvent and Incident records, and triggers the 4-stage Agent Workflow.
    """
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        headers = {"Authorization": f"Bearer {viewer_token}"}

        # 1. Safe position on walkway (X: 10.0, Z: 20.0)
        res_safe = await client.post(
            "/api/v1/twin/walkthrough-analyze",
            json={
                "environment_id": "manufacturing-plant",
                "x": 10.0,
                "y": 1.75,
                "z": 20.0,
                "heading_deg": 90.0,
                "worker_alias": "Inspector (Walkthrough)",
            },
            headers=headers,
        )
        assert res_safe.status_code == 200
        safe_data = res_safe.json()
        assert safe_data["is_violation"] is False

        # 2. Breach position inside Assembly Cell B Exclusion Zone (X: 32.38, Z: 14.20)
        res_breach = await client.post(
            "/api/v1/twin/walkthrough-analyze",
            json={
                "environment_id": "manufacturing-plant",
                "x": 32.38,
                "y": 1.75,
                "z": 14.20,
                "heading_deg": 90.0,
                "worker_alias": "Inspector (Walkthrough)",
            },
            headers=headers,
        )
        assert res_breach.status_code == 200
        breach_data = res_breach.json()
        assert breach_data["is_violation"] is True
        assert breach_data["severity"] == "CRITICAL"
        assert "zone" in breach_data
        assert breach_data["zone"]["name"] == "Assembly Cell B Exclusion Zone"
        assert "event_id" in breach_data
        assert "incident_id" in breach_data
        assert "agent_state" in breach_data
        assert breach_data["agent_state"]["status"] in ("COMPLETED", "VERIFIED")
        assert breach_data["agent_state"]["policy_result"] is not None
        assert breach_data["agent_state"]["policy_result"]["is_policy_violated"] is True


