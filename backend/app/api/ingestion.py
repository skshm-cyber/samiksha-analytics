"""
Ingestion routes — receive data from tracker.js.

POST /api/track  → page view data
POST /api/event  → interaction data
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas import TrackRequest, EventRequest, IngestionResponse
from ..services.ingestion import ingest_page_view, ingest_event

router = APIRouter()


@router.post("/api/track", response_model=IngestionResponse)
async def track_visit(data: TrackRequest, db: AsyncSession = Depends(get_db)):
    """Receive page view data from tracker.js."""
    await ingest_page_view(db, data)
    return IngestionResponse(status="ok")


@router.post("/api/event", response_model=IngestionResponse)
async def track_event(data: EventRequest, db: AsyncSession = Depends(get_db)):
    """Receive interaction data from tracker.js."""
    await ingest_event(db, data)
    return IngestionResponse(status="ok")
