"""
Safety Event Repository for persisting and querying detected safety events.
"""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel.db.models import SafetyEventModel
from sentinel.rules.types import SafetyEventCandidate


class EventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_from_candidate(self, candidate: SafetyEventCandidate) -> SafetyEventModel:
        """Persists a SafetyEventCandidate into the database."""
        event = SafetyEventModel(
            id=candidate.event_id,
            source_id=candidate.source_id,
            track_id=candidate.track_id,
            event_type=candidate.event_type.value,
            severity=candidate.severity.value,
            zone_id=candidate.zone_id,
            rule_id=candidate.rule_id,
            first_observation_ns=candidate.first_observation_ns,
            last_observation_ns=candidate.last_observation_ns,
            persistence_count=candidate.persistence_count,
            confidence=candidate.confidence,
            deduplication_key=candidate.deduplication_key,
            meta_json=candidate.metadata,
        )
        self.session.add(event)
        await self.session.flush()
        return event

    async def get_by_id(self, event_id: str) -> Optional[SafetyEventModel]:
        stmt = select(SafetyEventModel).where(SafetyEventModel.id == event_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def get_by_dedup_key(self, dedup_key: str) -> Optional[SafetyEventModel]:
        stmt = select(SafetyEventModel).where(SafetyEventModel.deduplication_key == dedup_key)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_events(
        self,
        limit: int = 50,
        event_type: Optional[str] = None,
        source_id: Optional[str] = None,
    ) -> list[SafetyEventModel]:
        stmt = select(SafetyEventModel).order_by(SafetyEventModel.created_at.desc())
        if event_type:
            stmt = stmt.where(SafetyEventModel.event_type == event_type)
        if source_id:
            stmt = stmt.where(SafetyEventModel.source_id == source_id)
        stmt = stmt.limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
