"""
Evidence Repository for managing physical media assets, SHA-256 cryptographic hashing,
and evidence-to-incident traceability.
"""

import hashlib
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel.db.models import EvidenceAssetModel


class EvidenceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def calculate_sha256(file_path: Path) -> str:
        """Computes SHA-256 checksum of an evidence media file."""
        sha256 = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                sha256.update(chunk)
        return sha256.hexdigest()

    async def register_asset(
        self,
        asset_id: str,
        file_path: Path,
        asset_type: str = "FRAME",
        incident_id: Optional[str] = None,
        mime_type: str = "image/jpeg",
    ) -> EvidenceAssetModel:
        """Calculates hash and registers asset in database."""
        sha256_hash = self.calculate_sha256(file_path)
        byte_size = file_path.stat().st_size

        asset = EvidenceAssetModel(
            id=asset_id,
            incident_id=incident_id,
            asset_type=asset_type,
            file_path=str(file_path),
            sha256_hash=sha256_hash,
            byte_size=byte_size,
            mime_type=mime_type,
        )
        self.session.add(asset)
        await self.session.flush()
        return asset

    async def get_by_id(self, asset_id: str) -> Optional[EvidenceAssetModel]:
        stmt = select(EvidenceAssetModel).where(EvidenceAssetModel.id == asset_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_by_incident(self, incident_id: str) -> list[EvidenceAssetModel]:
        stmt = select(EvidenceAssetModel).where(EvidenceAssetModel.incident_id == incident_id)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
