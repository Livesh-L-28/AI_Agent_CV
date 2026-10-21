"""
SENTINEL AI — Authentication & Authorization Regression Test Suite.
Verifies all 8 critical security requirements for Sprint 1A (DEF-01):
1. Unauthenticated requests cannot access protected routes (401).
2. A forged caller_role field grants no privileges.
3. Invalid, expired, or incorrectly signed tokens are rejected (401).
4. Low-privilege users cannot perform administrator actions (403).
5. Authorized users can perform only their permitted actions.
6. WebSocket access enforces authentication and permissions.
7. Direct tool invocation cannot bypass authorization.
8. Missing production secrets prevent protected-mode startup.
"""

from datetime import timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from sentinel.agents.tools import execute_tool
from sentinel.api.app import app
from sentinel.config import Settings
from sentinel.db.repositories.source_repo import SourceRepository
from sentinel.db.session import get_db_session, init_db
from sentinel.security.auth import (
    AuthenticatedUser,
    UserRole,
    create_access_token,
)


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


# 1. Unauthenticated requests cannot access protected routes
@pytest.mark.asyncio
async def test_unauthenticated_request_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Protected endpoints must reject unauthenticated requests with 401
        res1 = await client.get("/api/v1/incidents")
        assert res1.status_code == 401
        assert "WWW-Authenticate" in res1.headers

        res2 = await client.post("/api/v1/sources", json={"source_id": "c1", "name": "c", "source_type": "replay", "uri": "u"})
        assert res2.status_code == 401

        res3 = await client.post("/api/v1/agents/investigate/evt_dummy")
        assert res3.status_code == 401


# 2. A forged caller_role field in payload grants no privileges
@pytest.mark.asyncio
async def test_forged_caller_role_payload_grants_no_privileges():
    viewer_token = create_access_token(
        user_id="usr_viewer_01",
        username="viewer_val",
        role=UserRole.VIEWER,
    )
    headers = {"Authorization": f"Bearer {viewer_token}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers) as client:
        # Client attempts to spoof admin or safety_officer in request body to create a source (admin only)
        forged_payload = {
            "source_id": "cam-forged-01",
            "name": "Forged Camera",
            "source_type": "replay",
            "uri": "video.mp4",
            "caller_role": "admin",
            "role": "admin",
        }
        res = await client.post("/api/v1/sources", json=forged_payload)
        # Server must reject with 403 Forbidden because verified token identity is VIEWER
        assert res.status_code == 403
        assert "is not permitted to perform this action" in res.json()["detail"]


# 3. Invalid, expired, or incorrectly signed tokens are rejected
@pytest.mark.asyncio
async def test_invalid_and_expired_tokens_rejected():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # a) Malformed token
        res_malformed = await client.get("/api/v1/incidents", headers={"Authorization": "Bearer not-a-valid-jwt"})
        assert res_malformed.status_code == 401

        # b) Expired token (-10 seconds)
        expired_token = create_access_token(
            user_id="usr_expired",
            username="expired_user",
            role=UserRole.ADMIN,
            expires_delta=timedelta(seconds=-10),
        )
        res_expired = await client.get("/api/v1/incidents", headers={"Authorization": f"Bearer {expired_token}"})
        assert res_expired.status_code == 401
        assert "expired" in res_expired.json()["detail"].lower()

        # c) Incorrectly signed token (signed with an attacker's rogue secret)
        tampered_token = create_access_token(
            user_id="usr_rogue",
            username="rogue_user",
            role=UserRole.ADMIN,
            secret_key_override="an-attacker-rogue-secret-key-32chars!!",
        )
        res_tampered = await client.get("/api/v1/incidents", headers={"Authorization": f"Bearer {tampered_token}"})
        assert res_tampered.status_code == 401


# 4. Low-privilege user cannot perform administrator actions
@pytest.mark.asyncio
async def test_low_privilege_user_cannot_perform_admin_actions():
    officer_token = create_access_token(
        user_id="usr_officer_02",
        username="officer_dan",
        role=UserRole.SAFETY_OFFICER,
    )
    headers = {"Authorization": f"Bearer {officer_token}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers) as client:
        # Safety officer can view sources, but CANNOT create sources (Admin only)
        res_list = await client.get("/api/v1/sources")
        assert res_list.status_code == 200

        res_create = await client.post(
            "/api/v1/sources",
            json={"source_id": "cam-officer-fail", "name": "Cam", "source_type": "replay", "uri": "u"},
        )
        assert res_create.status_code == 403
        assert "is not permitted to perform this action" in res_create.json()["detail"]


# 5. Authorized users can perform only permitted actions
@pytest.mark.asyncio
async def test_authorized_users_permitted_actions():
    admin_token = create_access_token(
        user_id="usr_admin_02",
        username="admin_carol",
        role=UserRole.ADMIN,
    )
    headers = {"Authorization": f"Bearer {admin_token}"}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=headers) as client:
        res = await client.post(
            "/api/v1/sources",
            json={"source_id": "cam-admin-ok", "name": "Cam Admin", "source_type": "replay", "uri": "data/fixtures/synthetic_safety_video.mp4"},
        )
        assert res.status_code == 201
        assert res.json()["id"] == "cam-admin-ok"


# 6. WebSocket access enforces authentication and permissions
@pytest.mark.asyncio
async def test_websocket_authentication():
    # WebSocket client using httpx / starlette test client
    from starlette.testclient import TestClient

    test_client = TestClient(app)

    # a) Unauthenticated WebSocket rejected
    with pytest.raises(Exception):
        with test_client.websocket_connect("/api/v1/stream"):
            pass

    # b) Authenticated WebSocket accepted
    viewer_token = create_access_token(
        user_id="usr_ws_viewer",
        username="viewer_ws",
        role=UserRole.VIEWER,
    )
    with test_client.websocket_connect(f"/api/v1/stream?token={viewer_token}") as ws:
        handshake = ws.receive_json()
        assert handshake["type"] == "HANDSHAKE"
        assert handshake["authenticated_user"] == "viewer_ws"
        assert handshake["role"] == "viewer"
        ws.send_text("ping")
        resp = ws.receive_text()
        assert resp == "pong"


# 7. Direct tool invocation cannot bypass authorization
@pytest.mark.asyncio
async def test_direct_tool_invocation_authorization_enforcement():
    async with get_db_session() as session:
        src_repo = SourceRepository(session)
        await src_repo.create_source("cam-tool-test", "Cam Tool", "replay", "uri")

        # a) Direct invocation with None caller is blocked
        res_none = await execute_tool(
            session=session,
            tool_name="create_incident",
            parameters={"incident_id": "inc_auth_fail", "event_id": "evt_1", "title": "T", "severity": "HIGH"},
            idempotency_key="idemp_1",
            caller=None,
        )
        assert res_none.status == "REJECTED_UNAUTHORIZED"
        assert "requires an authorized caller" in res_none.error

        # b) Direct invocation with VIEWER caller is blocked from privileged tools
        viewer_user = AuthenticatedUser(user_id="u_v", username="viewer_sam", role=UserRole.VIEWER)
        res_viewer = await execute_tool(
            session=session,
            tool_name="create_incident",
            parameters={"incident_id": "inc_auth_fail_2", "event_id": "evt_1", "title": "T", "severity": "HIGH"},
            idempotency_key="idemp_2",
            caller=viewer_user,
        )
        assert res_viewer.status == "REJECTED_UNAUTHORIZED"
        assert "is not authorized to execute tool" in res_viewer.error

        # c) Direct invocation with SAFETY_OFFICER caller succeeds
        officer_user = AuthenticatedUser(user_id="u_o", username="officer_jane", role=UserRole.SAFETY_OFFICER)
        res_officer = await execute_tool(
            session=session,
            tool_name="create_incident",
            parameters={"incident_id": "inc_auth_ok_1", "event_id": "evt_1", "title": "T", "severity": "HIGH"},
            idempotency_key="idemp_3",
            caller=officer_user,
        )
        assert res_officer.status == "SUCCESS"


# 8. Missing production secrets prevent protected-mode startup
def test_missing_production_secrets_prevent_startup():
    # Production environment with missing secret must raise ValueError
    prod_settings_missing = Settings(
        environment="production",
        jwt_secret_key=None,
    )
    with pytest.raises(ValueError) as excinfo_missing:
        prod_settings_missing.validate_auth_secrets()
    assert "jwt_secret_key' is required in production mode" in str(excinfo_missing.value)

    # Production environment with insecure/short secret must raise ValueError
    prod_settings_short = Settings(
        environment="production",
        jwt_secret_key="short-secret-123",
    )
    with pytest.raises(ValueError) as excinfo_short:
        prod_settings_short.validate_auth_secrets()
    assert "must be at least 32 characters in production mode" in str(excinfo_short.value)

    # Staging environment with known default/insecure secret must raise ValueError
    staging_settings_insecure = Settings(
        environment="staging",
        jwt_secret_key="insecure-secret",
    )
    with pytest.raises(ValueError) as excinfo_insecure:
        staging_settings_insecure.validate_auth_secrets()
    assert "uses an unsafe/known default" in str(excinfo_insecure.value)

    # Valid secret in production passes validation
    valid_key = "a" * 32
    prod_settings_valid = Settings(
        environment="production",
        jwt_secret_key=valid_key,
    )
    prod_settings_valid.validate_auth_secrets()
    assert prod_settings_valid.get_jwt_secret_key() == valid_key
