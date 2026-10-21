"""
Evidence Repository for managing physical media assets, SHA-256 cryptographic hashing,
evidence-to-incident traceability, and rigorous integrity verification.

NOTE ON CRYPTOGRAPHIC CHAIN OF CUSTODY:
SHA-256 content hashing verifies data integrity against accidental bit-rot, corruption,
or out-of-band file tampering. It does NOT constitute a fully authenticated, non-repudiable
chain of custody (e.g. digital signatures or HSM-backed immutable ledgers). A privileged
attacker with simultaneous database write and filesystem access could alter both the file
and its stored digest.
"""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel.db.models import EvidenceAssetModel
from sentinel.db.repositories.audit_repo import AuditRepository
from sentinel.logging import get_correlation_id, setup_logging

logger = setup_logging()


class EvidenceError(Exception):
    """Base exception for evidence subsystem errors."""

    pass


class EvidenceNotFoundError(EvidenceError):
    """Evidence asset record or on-disk file not found."""

    pass


class EvidenceCrossIncidentError(EvidenceError):
    """Attempted access of an evidence asset under an unrelated incident."""

    pass


class EvidenceIntegrityError(EvidenceError):
    """Evidence content hash mismatch detected (file corrupted or tampered with)."""

    def __init__(self, asset_id: str, stored_hash: str, computed_hash: str) -> None:
        super().__init__(
            f"Evidence integrity check failed for asset '{asset_id}': "
            f"stored SHA-256 '{stored_hash}', computed SHA-256 '{computed_hash}'"
        )
        self.asset_id = asset_id
        self.stored_hash = stored_hash
        self.computed_hash = computed_hash


class EvidenceRepository:
    """Manages physical media evidence assets with server-side SHA-256 verification."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def calculate_sha256(file_path: Path) -> str:
        """Computes SHA-256 checksum of an on-disk evidence media file."""
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                sha256.update(chunk)
        return sha256.hexdigest()

    @staticmethod
    def calculate_bytes_sha256(data: bytes) -> str:
        """Computes SHA-256 checksum of exact memory bytes."""
        return hashlib.sha256(data).hexdigest()

    async def register_asset(
        self,
        asset_id: str,
        file_path: Path,
        asset_type: str = "FRAME",
        incident_id: Optional[str] = None,
        mime_type: str = "image/jpeg",
    ) -> EvidenceAssetModel:
        """Calculates hash and registers asset in database."""
        if not file_path.is_file():
            raise EvidenceNotFoundError(f"Cannot register missing evidence file: {file_path}")

        sha256_hash = self.calculate_sha256(file_path)
        byte_size = file_path.stat().st_size

        asset = EvidenceAssetModel(
            id=asset_id,
            incident_id=incident_id,
            asset_type=asset_type,
            file_path=str(file_path.resolve()),
            sha256_hash=sha256_hash,
            byte_size=byte_size,
            mime_type=mime_type,
        )
        self.session.add(asset)
        await self.session.flush()
        return asset

    async def get_by_id(self, asset_id: str) -> Optional[EvidenceAssetModel]:
        """Fetches raw database model for evidence asset."""
        stmt = select(EvidenceAssetModel).where(EvidenceAssetModel.id == asset_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_incident(self, incident_id: str) -> list[EvidenceAssetModel]:
        """Lists all evidence assets associated with a given incident."""
        stmt = select(EvidenceAssetModel).where(EvidenceAssetModel.incident_id == incident_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def get_verified_asset_bytes(
        self,
        asset_id: str,
        incident_id: Optional[str] = None,
        actor: str = "system",
    ) -> tuple[EvidenceAssetModel, bytes]:
        """
        Retrieves evidence asset and verifies SHA-256 against stored digest before returning bytes.
        If file is missing or hash does not match, records a security audit log and raises an exception.
        Never serves tampered or corrupted evidence bytes.
        """
        cid = get_correlation_id() or f"ev_verify_{asset_id}"
        audit_repo = AuditRepository(self.session)

        # 1. Fetch metadata record
        asset = await self.get_by_id(asset_id)
        if not asset:
            await audit_repo.log_action(
                correlation_id=cid,
                actor=actor,
                action="EVIDENCE_RETRIEVAL_FAILED",
                resource_type="EVIDENCE_ASSET",
                resource_id=asset_id,
                outcome="FAILURE",
                details={"reason": "Asset record not found"},
            )
            raise EvidenceNotFoundError(f"Evidence asset '{asset_id}' not found")

        # 2. Cross-incident boundary validation
        if incident_id is not None and asset.incident_id != incident_id:
            await audit_repo.log_action(
                correlation_id=cid,
                actor=actor,
                action="EVIDENCE_CROSS_INCIDENT_ACCESS_BLOCKED",
                resource_type="EVIDENCE_ASSET",
                resource_id=asset_id,
                outcome="BLOCKED",
                details={
                    "requested_incident": incident_id,
                    "actual_incident": asset.incident_id,
                },
            )
            raise EvidenceCrossIncidentError(
                f"Evidence asset '{asset_id}' does not belong to incident '{incident_id}'"
            )

        # 3. File existence check
        file_path = Path(asset.file_path)
        if not file_path.is_file():
            await audit_repo.log_action(
                correlation_id=cid,
                actor=actor,
                action="EVIDENCE_FILE_MISSING",
                resource_type="EVIDENCE_ASSET",
                resource_id=asset_id,
                outcome="FAILURE",
                details={"file_path": str(file_path)},
            )
            raise EvidenceNotFoundError(f"Physical evidence file missing on disk: {file_path}")

        # 4. Read exact original bytes
        file_bytes = file_path.read_bytes()

        # 5. Compute and rigorously verify SHA-256 digest
        computed_hash = self.calculate_bytes_sha256(file_bytes)
        if computed_hash != asset.sha256_hash:
            logger.error(
                f"CRITICAL EVIDENCE INTEGRITY BREACH: Asset '{asset_id}' hash mismatch! "
                f"Expected: {asset.sha256_hash}, Computed: {computed_hash}"
            )
            await audit_repo.log_action(
                correlation_id=cid,
                actor=actor,
                action="EVIDENCE_INTEGRITY_VIOLATION",
                resource_type="EVIDENCE_ASSET",
                resource_id=asset_id,
                outcome="TAMPER_DETECTED",
                details={
                    "stored_hash": asset.sha256_hash,
                    "computed_hash": computed_hash,
                    "file_path": str(file_path),
                },
            )
            raise EvidenceIntegrityError(
                asset_id=asset_id,
                stored_hash=asset.sha256_hash,
                computed_hash=computed_hash,
            )

        # 6. Log successful verified retrieval
        await audit_repo.log_action(
            correlation_id=cid,
            actor=actor,
            action="EVIDENCE_RETRIEVAL_VERIFIED",
            resource_type="EVIDENCE_ASSET",
            resource_id=asset_id,
            outcome="SUCCESS",
            details={
                "sha256": computed_hash,
                "byte_size": len(file_bytes),
            },
        )

        return asset, file_bytes
