"""
Video Source Management API Router.
"""

from fastapi import APIRouter, HTTPException, status

from sentinel.api.schemas import SourceCreateRequest, SourceResponse
from sentinel.db.repositories.source_repo import SourceRepository
from sentinel.db.session import get_db_session

router = APIRouter(prefix="/api/v1/sources", tags=["Sources"])


@router.post("", response_model=SourceResponse, status_code=status.HTTP_201_CREATED)
async def create_source(payload: SourceCreateRequest):
    """Registers a new video source (webcam, replay, or upload)."""
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
async def list_sources():
    """Lists all configured video sources."""
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
async def start_source(source_id: str):
    """Marks a source as active/running."""
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
async def stop_source(source_id: str):
    """Stops an active video source."""
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
