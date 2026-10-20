"""
Video Source Repository for managing camera and stream records.
"""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel.db.models import VideoSourceModel


class SourceRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_source(
        self,
        source_id: str,
        name: str,
        source_type: str,
        uri: str,
        status: str = "CREATED",
        fps: float = 25.0,
    ) -> VideoSourceModel:
        source = VideoSourceModel(
            id=source_id,
            name=name,
            source_type=source_type,
            uri=uri,
            status=status,
            fps=fps,
        )
        self.session.add(source)
        await self.session.flush()
        return source

    async def get_by_id(self, source_id: str) -> Optional[VideoSourceModel]:
        stmt = select(VideoSourceModel).where(VideoSourceModel.id == source_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_sources(self) -> list[VideoSourceModel]:
        stmt = select(VideoSourceModel).order_by(VideoSourceModel.created_at.desc())
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update_status(self, source_id: str, status: str) -> Optional[VideoSourceModel]:
        source = await self.get_by_id(source_id)
        if source:
            source.status = status
            await self.session.flush()
        return source
