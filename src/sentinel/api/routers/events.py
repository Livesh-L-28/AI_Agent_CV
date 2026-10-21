"""
Safety Events API Router.
Protected with server-side JWT authentication and role-based access control.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from sentinel.api.schemas import EventResponse
from sentinel.db.repositories.event_repo import EventRepository
from sentinel.db.session import get_db_session
from sentinel.security.auth import AuthenticatedUser, UserRole, require_role

router = APIRouter(prefix="/api/v1/events", tags=["Events"])


@router.get("", response_model=list[EventResponse])
async def list_events(
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    source_id: Optional[str] = Query(None, description="Filter by source ID"),
    limit: int = Query(50, ge=1, le=200),
    user: AuthenticatedUser = Depends(
        require_role(UserRole.VIEWER, UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Retrieves detected safety event candidates. Requires authenticated user."""
    async with get_db_session() as session:
        repo = EventRepository(session)
        events = await repo.list_events(limit=limit, event_type=event_type, source_id=source_id)
        return [
            EventResponse(
                id=e.id,
                source_id=e.source_id,
                track_id=e.track_id,
                event_type=e.event_type,
                severity=e.severity,
                zone_id=e.zone_id,
                rule_id=e.rule_id,
                first_observation_ns=e.first_observation_ns,
                last_observation_ns=e.last_observation_ns,
                persistence_count=e.persistence_count,
                confidence=e.confidence,
                deduplication_key=e.deduplication_key,
                meta_json=e.meta_json,
                created_at=e.created_at,
            )
            for e in events
        ]


@router.get("/{event_id}", response_model=EventResponse)
async def get_event(
    event_id: str,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.VIEWER, UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Retrieves a specific safety event by ID. Requires authenticated user."""
    async with get_db_session() as session:
        repo = EventRepository(session)
        event = await repo.get_by_id(event_id)
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Safety event '{event_id}' not found",
            )
        return EventResponse(
            id=event.id,
            source_id=event.source_id,
            track_id=event.track_id,
            event_type=event.event_type,
            severity=event.severity,
            zone_id=event.zone_id,
            rule_id=event.rule_id,
            first_observation_ns=event.first_observation_ns,
            last_observation_ns=event.last_observation_ns,
            persistence_count=event.persistence_count,
            confidence=event.confidence,
            deduplication_key=event.deduplication_key,
            meta_json=event.meta_json,
            created_at=event.created_at,
        )
