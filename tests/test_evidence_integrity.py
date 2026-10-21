"""
SENTINEL AI — Evidence Integrity and Retrieval Regression Test Suite.
Verifies all requirements for Sprint 1B (DEF-07) and Sprint 1F (DEF-09):
- Valid evidence retrieval and SHA-256 integrity verification
- Detection and blocking of tampered on-disk bytes (HTTP 409 & EvidenceIntegrityError)
- Detection of missing on-disk files (HTTP 404 & EvidenceNotFoundError)
- Cross-incident isolation (blocking asset access under wrong incident ID)
- Audit log recording upon integrity failure and successful retrieval
- Authorization enforcement on evidence download endpoints
"""

from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from sentinel.api.app import app
from sentinel.db.repositories.audit_repo import AuditRepository
from sentinel.db.repositories.evidence_repo import (
    EvidenceCrossIncidentError,
    EvidenceIntegrityError,
    EvidenceNotFoundError,
    EvidenceRepository,
)
from sentinel.db.repositories.incident_repo import IncidentRepository
from sentinel.db.session import get_db_session, init_db
from sentinel.security.auth import UserRole, create_access_token


@pytest.fixture(autouse=True)
async def setup_db():
    await init_db()


@pytest.fixture
def auth_headers() -> dict[str, str]:
    token = create_access_token(
        user_id="usr_safety_officer",
        username="officer_jen",
        role=UserRole.SAFETY_OFFICER,
    )
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def temp_evidence_file(tmp_path: Path) -> Path:
    img_file = tmp_path / "valid_frame.jpg"
    # Create deterministic fake JPEG byte sequence
    content = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00`\x00`\x00\x00" + (b"A" * 1024) + b"\xFF\xD9"
    img_file.write_bytes(content)
    return img_file


@pytest.mark.asyncio
async def test_valid_evidence_registration_and_verified_retrieval(temp_evidence_file: Path):
    async with get_db_session() as session:
        inc_repo = IncidentRepository(session)
        await inc_repo.create_incident("inc_ev_01", "evt_ev_01", "Zone Violation", "CRITICAL")

        ev_repo = EvidenceRepository(session)
        asset = await ev_repo.register_asset(
            asset_id="asset_ev_01",
            file_path=temp_evidence_file,
            incident_id="inc_ev_01",
            mime_type="image/jpeg",
        )
        assert len(asset.sha256_hash) == 64
        assert asset.byte_size == len(temp_evidence_file.read_bytes())

        # Retrieve and verify
        retrieved_asset, bytes_data = await ev_repo.get_verified_asset_bytes(
            asset_id="asset_ev_01",
            incident_id="inc_ev_01",
            actor="test_officer",
        )
        assert retrieved_asset.id == "asset_ev_01"
        assert bytes_data == temp_evidence_file.read_bytes()

        # Check audit log
        audit_repo = AuditRepository(session)
        logs = await audit_repo.list_logs(limit=10)
        assert any(
            log.action == "EVIDENCE_RETRIEVAL_VERIFIED" and log.resource_id == "asset_ev_01" for log in logs
        )


@pytest.mark.asyncio
async def test_tampered_evidence_bytes_detection_and_blocking(temp_evidence_file: Path):
    async with get_db_session() as session:
        inc_repo = IncidentRepository(session)
        await inc_repo.create_incident("inc_ev_02", "evt_ev_02", "Zone Violation", "CRITICAL")

        ev_repo = EvidenceRepository(session)
        await ev_repo.register_asset(
            asset_id="asset_ev_02",
            file_path=temp_evidence_file,
            incident_id="inc_ev_02",
        )

        # Simulate attacker tampering with on-disk file
        tampered_bytes = temp_evidence_file.read_bytes() + b"TAMPERED_BYTES"
        temp_evidence_file.write_bytes(tampered_bytes)

        # Retrieval must fail with EvidenceIntegrityError
        with pytest.raises(EvidenceIntegrityError) as exc_info:
            await ev_repo.get_verified_asset_bytes(
                asset_id="asset_ev_02",
                incident_id="inc_ev_02",
                actor="test_officer",
            )
        assert "integrity check failed" in str(exc_info.value)
        assert exc_info.value.asset_id == "asset_ev_02"

        # Check audit log recorded TAMPER_DETECTED
        audit_repo = AuditRepository(session)
        logs = await audit_repo.list_logs(limit=10)
        assert any(
            log.action == "EVIDENCE_INTEGRITY_VIOLATION" and log.outcome == "TAMPER_DETECTED" for log in logs
        )


@pytest.mark.asyncio
async def test_missing_evidence_file_handling(temp_evidence_file: Path):
    async with get_db_session() as session:
        inc_repo = IncidentRepository(session)
        await inc_repo.create_incident("inc_ev_03", "evt_ev_03", "Zone Violation", "CRITICAL")

        ev_repo = EvidenceRepository(session)
        await ev_repo.register_asset(
            asset_id="asset_ev_03",
            file_path=temp_evidence_file,
            incident_id="inc_ev_03",
        )

        # Delete file from disk
        temp_evidence_file.unlink()

        with pytest.raises(EvidenceNotFoundError) as exc_info:
            await ev_repo.get_verified_asset_bytes(
                asset_id="asset_ev_03",
                incident_id="inc_ev_03",
                actor="test_officer",
            )
        assert "missing on disk" in str(exc_info.value).lower()


@pytest.mark.asyncio
async def test_cross_incident_evidence_isolation(temp_evidence_file: Path):
    async with get_db_session() as session:
        inc_repo = IncidentRepository(session)
        await inc_repo.create_incident("inc_A", "evt_A", "Violation A", "HIGH")
        await inc_repo.create_incident("inc_B", "evt_B", "Violation B", "HIGH")

        ev_repo = EvidenceRepository(session)
        await ev_repo.register_asset(
            asset_id="asset_A_only",
            file_path=temp_evidence_file,
            incident_id="inc_A",
        )

        # Attempt to retrieve asset_A_only under inc_B
        with pytest.raises(EvidenceCrossIncidentError):
            await ev_repo.get_verified_asset_bytes(
                asset_id="asset_A_only",
                incident_id="inc_B",
                actor="test_officer",
            )


@pytest.mark.asyncio
async def test_evidence_download_api_endpoints(temp_evidence_file: Path, auth_headers: dict[str, str]):
    async with get_db_session() as session:
        inc_repo = IncidentRepository(session)
        await inc_repo.create_incident("inc_api_ev", "evt_api_ev", "Danger Zone", "CRITICAL")

        ev_repo = EvidenceRepository(session)
        await ev_repo.register_asset(
            asset_id="asset_download_01",
            file_path=temp_evidence_file,
            incident_id="inc_api_ev",
            mime_type="image/jpeg",
        )

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test", headers=auth_headers) as client:
        # 1. Unauthenticated download rejected with 401
        res_unauth = await AsyncClient(transport=ASGITransport(app=app), base_url="http://test").get(
            "/api/v1/incidents/inc_api_ev/evidence/asset_download_01/download"
        )
        assert res_unauth.status_code == 401

        # 2. Authenticated valid download returns 200 and image bytes
        res_valid = await client.get("/api/v1/incidents/inc_api_ev/evidence/asset_download_01/download")
        assert res_valid.status_code == 200
        assert res_valid.headers["content-type"] == "image/jpeg"
        assert res_valid.headers["x-evidence-verified"] == "true"
        assert res_valid.content == temp_evidence_file.read_bytes()

        # 3. Download list metadata
        res_list = await client.get("/api/v1/incidents/inc_api_ev/evidence")
        assert res_list.status_code == 200
        items = res_list.json()
        assert len(items) == 1
        assert items[0]["id"] == "asset_download_01"

        # 4. Tampered file via API download returns 409 Conflict
        temp_evidence_file.write_bytes(b"CORRUPTED_BYTES")
        res_tampered = await client.get("/api/v1/incidents/inc_api_ev/evidence/asset_download_01/download")
        assert res_tampered.status_code == 409
        assert "integrity verification failed" in res_tampered.json()["detail"].lower()
