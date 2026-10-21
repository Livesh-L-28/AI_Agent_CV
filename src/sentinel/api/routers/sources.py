"""
Video Source Management API Router.
Protected with server-side JWT authentication and role-based access control.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from sentinel.api.schemas import SourceCreateRequest, SourceResponse
from sentinel.db.repositories.source_repo import SourceRepository
from sentinel.db.session import get_db_session
from sentinel.security.auth import AuthenticatedUser, UserRole, require_role

router = APIRouter(prefix="/api/v1/sources", tags=["Sources"])


@router.post("", response_model=SourceResponse, status_code=status.HTTP_201_CREATED)
async def create_source(
    payload: SourceCreateRequest,
    user: AuthenticatedUser = Depends(require_role(UserRole.ADMIN)),
):
    """Registers a new video source. Requires ADMIN role."""
    async with get_db_session() as session:
        repo = SourceRepository(session)
        existing = await repo.get_by_id(payload.source_id)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Source ID '{payload.source_id}' already exists",
            )

        source = await repo.create_source(
            source_id=payload.source_id,
            name=payload.name,
            source_type=payload.source_type,
            uri=payload.uri,
            status="CREATED",
            fps=payload.fps,
        )
        return SourceResponse(
            id=source.id,
            name=source.name,
            source_type=source.source_type,
            uri=source.uri,
            status=source.status,
            fps=source.fps,
            created_at=source.created_at,
        )


@router.get("", response_model=list[SourceResponse])
async def list_sources(
    user: AuthenticatedUser = Depends(
        require_role(UserRole.VIEWER, UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Lists all configured video sources. Requires authenticated user."""
    async with get_db_session() as session:
        repo = SourceRepository(session)
        sources = await repo.list_sources()
        return [
            SourceResponse(
                id=s.id,
                name=s.name,
                source_type=s.source_type,
                uri=s.uri,
                status=s.status,
                fps=s.fps,
                created_at=s.created_at,
            )
            for s in sources
        ]


@router.post("/{source_id}/start", response_model=SourceResponse)
async def start_source(
    source_id: str,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Marks a source as active/running. Requires SAFETY_OFFICER or ADMIN role."""
    async with get_db_session() as session:
        repo = SourceRepository(session)
        source = await repo.get_by_id(source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")
        updated = await repo.update_status(source_id, "RUNNING")
        return SourceResponse(
            id=updated.id,
            name=updated.name,
            source_type=updated.source_type,
            uri=updated.uri,
            status=updated.status,
            fps=updated.fps,
            created_at=updated.created_at,
        )


@router.post("/{source_id}/stop", response_model=SourceResponse)
async def stop_source(
    source_id: str,
    user: AuthenticatedUser = Depends(
        require_role(UserRole.SAFETY_OFFICER, UserRole.ADMIN)
    ),
):
    """Stops an active video source. Requires SAFETY_OFFICER or ADMIN role."""
    async with get_db_session() as session:
        repo = SourceRepository(session)
        source = await repo.get_by_id(source_id)
        if not source:
            raise HTTPException(status_code=404, detail="Source not found")
        updated = await repo.update_status(source_id, "STOPPED")
        return SourceResponse(
            id=updated.id,
            name=updated.name,
            source_type=updated.source_type,
            uri=updated.uri,
            status=updated.status,
            fps=updated.fps,
            created_at=updated.created_at,
        )
