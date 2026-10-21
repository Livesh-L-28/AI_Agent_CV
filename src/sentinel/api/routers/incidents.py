"""
Incident Management API Router.
Supports human-in-the-loop incident resolution, supervisory review, and status tracking.
Protected with server-side JWT authentication, role-based access control,
and SHA-256 evidence download verification.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from sentinel.api.schemas import (
    EvidenceAssetResponse,
    IncidentResponse,
    IncidentReviewRequest,
)
from sentinel.db.repositories.audit_repo import AuditRepository
from sentinel.db.repositories.evidence_repo import (
    EvidenceCrossIncidentError,
    EvidenceIntegrityError,
    EvidenceNotFoundError,
    EvidenceRepository,
)
from sentinel.db.repositories.incident_repo import IncidentRepository
from sentinel.db.session import get_db_session
from sentinel.logging import get_correlation_id
from sentinel.security.auth import AuthenticatedUser, UserRole, require_role

router = APIRouter(prefix="/api/v1/incidents", tags=["Incidents"])


@router.get("", response_model=list[IncidentResponse])
async def list_incidents(
    status_filter: Optional[str] = Query(
        None, alias="status", description="Filter by OPEN, RESOLVED, ACKNOWLEDGED, etc."
    ),
    severity_filter: Optional[str] = Query(
        None, alias="severity", description="Filter by CRITICAL, HIGH, etc."
    ),
    camera_id: Optional[str] = Query(
        None, alias="camera_id", description="Filter by camera source ID"
    ),
    zone_id: Optional[str] = Query(
        None, alias="zone_id", description="Filter by restricted zone ID"
    ),
    limit: int = Query(50, ge=1, le=200),
    user: AuthenticatedUser = Depends(
        require_role(UserRole.VIEWER, UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Lists incidents with rich enterprise multi-dimensional filtering. Requires authenticated user."""
    async with get_db_session() as session:
        repo = IncidentRepository(session)
        incidents = await repo.list_incidents(
            status=status_filter,
            severity=severity_filter,
            camera_id=camera_id,
            zone_id=zone_id,
            limit=limit,
        )
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
async def get_incident(
    incident_id: str,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.VIEWER, UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Retrieves an incident by ID. Requires authenticated user."""
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
async def review_incident(
    incident_id: str,
    payload: IncidentReviewRequest,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """
    Applies human-in-the-loop supervisory review to an incident.
    Requires SAFETY_OFFICER or ADMIN role.
    Reviewer identity is strictly derived from the verified token, never client payload.
    """
    async with get_db_session() as session:
        inc_repo = IncidentRepository(session)
        audit_repo = AuditRepository(session)

        incident = await inc_repo.get_by_id(incident_id)
        if not incident:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Incident '{incident_id}' not found",
            )

        action_upper = payload.action.upper()
        if action_upper in ["ACKNOWLEDGE", "ACK"]:
            new_status = "ACKNOWLEDGED"
        elif action_upper in ["RESOLVE", "DISMISS"]:
            new_status = "RESOLVED"
        else:
            new_status = "ESCALATED"

        # Derived strictly from verified authenticated user
        verified_reviewer = user.username

        updated = await inc_repo.update_status(
            incident_id=incident_id,
            status=new_status,
            assigned_to=verified_reviewer,
            resolution_notes=payload.notes,
        )

        # Log to immutable audit trail with verified identity
        cid = get_correlation_id() or "api_review"
        await audit_repo.log_action(
            correlation_id=cid,
            actor=verified_reviewer,
            action=f"INCIDENT_REVIEW_{payload.action.upper()}",
            resource_type="INCIDENT",
            resource_id=incident_id,
            outcome="SUCCESS",
            details={
                "previous_status": incident.status,
                "new_status": new_status,
                "notes": payload.notes,
                "caller_user_id": user.user_id,
                "caller_role": user.role.value,
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


@router.get("/{incident_id}/evidence", response_model=list[EvidenceAssetResponse])
async def list_incident_evidence(
    incident_id: str,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.VIEWER, UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Lists all evidence metadata for an incident. Requires authenticated user."""
    async with get_db_session() as session:
        inc_repo = IncidentRepository(session)
        incident = await inc_repo.get_by_id(incident_id)
        if not incident:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Incident '{incident_id}' not found",
            )
        ev_repo = EvidenceRepository(session)
        assets = await ev_repo.list_by_incident(incident_id)
        return [
            EvidenceAssetResponse(
                id=a.id,
                incident_id=a.incident_id,
                asset_type=a.asset_type,
                sha256_hash=a.sha256_hash,
                byte_size=a.byte_size,
                mime_type=a.mime_type,
                created_at=a.created_at,
            )
            for a in assets
        ]


@router.get("/{incident_id}/evidence/{asset_id}/download")
async def download_incident_evidence(
    incident_id: str,
    asset_id: str,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.VIEWER, UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """
    Downloads verified evidence media bytes with rigorous SHA-256 integrity verification.
    Enforces cross-incident boundary validation and rejects tampered/corrupted assets with HTTP 409.
    Does not leak arbitrary filesystem paths.
    """
    async with get_db_session() as session:
        inc_repo = IncidentRepository(session)
        incident = await inc_repo.get_by_id(incident_id)
        if not incident:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Incident '{incident_id}' not found",
            )

        ev_repo = EvidenceRepository(session)
        try:
            asset, file_bytes = await ev_repo.get_verified_asset_bytes(
                asset_id=asset_id,
                incident_id=incident_id,
                actor=user.username,
            )
        except EvidenceNotFoundError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e),
            )
        except EvidenceCrossIncidentError as e:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=str(e),
            )
        except EvidenceIntegrityError as e:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Evidence integrity verification failed: {e}",
            )

        safe_filename = f"evidence_{incident_id}_{asset_id}.jpg"
        media_type = asset.mime_type or "image/jpeg"

        return Response(
            content=file_bytes,
            media_type=media_type,
            headers={
                "Content-Disposition": f'attachment; filename="{safe_filename}"',
                "X-Evidence-SHA256": asset.sha256_hash,
                "X-Evidence-Verified": "true",
            },
        )
