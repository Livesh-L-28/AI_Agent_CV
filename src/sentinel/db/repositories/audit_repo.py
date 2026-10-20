"""
Audit Log Repository for immutable security audit trails and action traceability.
"""

from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from sentinel.db.models import AuditLogModel


class AuditRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def log_action(
        self,
        correlation_id: str,
        actor: str,
        action: str,
        resource_type: str,
        resource_id: str,
        outcome: str = "SUCCESS",
        details: Optional[dict[str, Any]] = None,
    ) -> AuditLogModel:
        """Records an immutable security audit entry."""
        log_entry = AuditLogModel(
            correlation_id=correlation_id,
            actor=actor,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            outcome=outcome,
            details_json=details or {},
        )
        self.session.add(log_entry)
        await self.session.flush()
        return log_entry

    async def list_logs(
        self,
        correlation_id: Optional[str] = None,
        limit: int = 100,
    ) -> list[AuditLogModel]:
        stmt = select(AuditLogModel).order_by(AuditLogModel.timestamp.desc())
        if correlation_id:
            stmt = stmt.where(AuditLogModel.correlation_id == correlation_id)
        stmt = stmt.limit(limit)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())
