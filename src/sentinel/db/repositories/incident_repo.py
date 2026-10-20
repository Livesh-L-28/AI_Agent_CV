"""
Incident Repository for lifecycle, human review, and incident resolution tracking.
"""

from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel.db.models import IncidentModel


class IncidentRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def create_incident(
        self,
        incident_id: str,
        event_id: str,
        title: str,
        severity: str,
        status: str = "OPEN",
    ) -> IncidentModel:
        incident = IncidentModel(
            id=incident_id,
            event_id=event_id,
            title=title,
            severity=severity,
            status=status,
        )
        self.session.add(incident)
        await self.session.flush()
        return incident

    async def get_by_id(self, incident_id: str) -> Optional[IncidentModel]:
        stmt = select(IncidentModel).where(IncidentModel.id == incident_id)
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def list_incidents(
        self,
        status: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 50,
    ) -> list[IncidentModel]:
        stmt = select(IncidentModel).order_by(IncidentModel.created_at.desc())
        if status:
            stmt = stmt.where(IncidentModel.status == status)
        if severity:
            stmt = stmt.where(IncidentModel.severity == severity)
        stmt = stmt.limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def update_status(
        self,
        incident_id: str,
        status: str,
        assigned_to: Optional[str] = None,
        resolution_notes: Optional[str] = None,
    ) -> Optional[IncidentModel]:
        incident = await self.get_by_id(incident_id)
        if incident:
            incident.status = status
            if assigned_to is not None:
                incident.assigned_to = assigned_to
            if resolution_notes is not None:
                incident.resolution_notes = resolution_notes
            await self.session.flush()
            await self.session.refresh(incident)
        return incident
