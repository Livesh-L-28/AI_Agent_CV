"""
Incident Management API Router.
Supports human-in-the-loop incident resolution, supervisory review, and status tracking.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from sentinel.api.schemas import IncidentResponse, IncidentReviewRequest
from sentinel.db.repositories.audit_repo import AuditRepository
from sentinel.db.repositories.incident_repo import IncidentRepository
from sentinel.db.session import get_db_session
from sentinel.logging import get_correlation_id

router = APIRouter(prefix="/api/v1/incidents", tags=["Incidents"])


@router.get("", response_model=list[IncidentResponse])
async def list_incidents(
    status_filter: Optional[str] = Query(
        None, alias="status", description="Filter by OPEN, RESOLVED, etc."
    ),
    limit: int = Query(50, ge=1, le=200),
):
    """Lists incidents with optional status filtering."""
    async with get_db_session() as session:
        repo = IncidentRepository(session)
        incidents = await repo.list_incidents(status=status_filter, limit=limit)
        return [
            IncidentResponse(
                id=inc.id,
                event_id=inc.event_id,
                title=inc.title,
                status=inc.status,
                severity=inc.severity,
                assigned_to=inc.assigned_to,
                resolution_notes=inc.resolution_notes,
                created_at=inc.created_at,
                updated_at=inc.updated_at,
            )
            for inc in incidents
        ]


@router.get("/{incident_id}", response_model=IncidentResponse)
async def get_incident(incident_id: str):
    """Retrieves an incident by ID."""
    async with get_db_session() as session:
        repo = IncidentRepository(session)
        incident = await repo.get_by_id(incident_id)
        if not incident:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Incident '{incident_id}' not found",
            )
        return IncidentResponse(
            id=incident.id,
            event_id=incident.event_id,
            title=incident.title,
            status=incident.status,
            severity=incident.severity,
            assigned_to=incident.assigned_to,
            resolution_notes=incident.resolution_notes,
            created_at=incident.created_at,
            updated_at=incident.updated_at,
        )


@router.post("/{incident_id}/review", response_model=IncidentResponse)
async def review_incident(incident_id: str, payload: IncidentReviewRequest):
    """Applies human-in-the-loop supervisory review to an incident."""
    async with get_db_session() as session:
        inc_repo = IncidentRepository(session)
        audit_repo = AuditRepository(session)

        incident = await inc_repo.get_by_id(incident_id)
        if not incident:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Incident '{incident_id}' not found",
            )

        new_status = "RESOLVED" if payload.action.upper() in ["RESOLVE", "DISMISS"] else "ESCALATED"

        updated = await inc_repo.update_status(
            incident_id=incident_id,
            status=new_status,
            assigned_to=payload.reviewer_name,
            resolution_notes=payload.notes,
        )

        # Log to immutable audit trail
        cid = get_correlation_id() or "api_review"
        await audit_repo.log_action(
            correlation_id=cid,
            actor=payload.reviewer_name,
            action=f"INCIDENT_REVIEW_{payload.action.upper()}",
            resource_type="INCIDENT",
            resource_id=incident_id,
            outcome="SUCCESS",
            details={
                "previous_status": incident.status,
                "new_status": new_status,
                "notes": payload.notes,
            },
        )

        return IncidentResponse(
            id=updated.id,
            event_id=updated.event_id,
            title=updated.title,
            status=updated.status,
            severity=updated.severity,
            assigned_to=updated.assigned_to,
            resolution_notes=updated.resolution_notes,
            created_at=updated.created_at,
            updated_at=updated.updated_at,
        )
