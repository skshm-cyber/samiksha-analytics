"""
Analytics routes — serve data to the dashboard.

All endpoints return JSON. The dashboard calls these via fetch().

Query parameter: ?days=N (defaults to 1 for most, 30 for trends).
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..services import analytics

router = APIRouter()


@router.get("/api/stats/overview")
async def overview(db: AsyncSession = Depends(get_db)):
    """Hero cards: visitors, live, page views, sessions."""
    return await analytics.get_overview_stats(db)


@router.get("/api/stats/secondary")
async def secondary(db: AsyncSession = Depends(get_db)):
    """Secondary cards: unique, duration, bounce, conversion, returning, new."""
    return await analytics.get_secondary_stats(db)


@router.get("/api/stats/hourly")
async def hourly(
    days: int = Query(default=1, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Visitors by hour of day."""
    return {"hourly": await analytics.get_hourly_data(db, days)}


@router.get("/api/stats/pages")
async def pages(
    days: int = Query(default=1, ge=1, le=90),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Most visited pages."""
    return {"pages": await analytics.get_top_pages(db, days, limit)}


@router.get("/api/stats/referrers")
async def referrers(
    days: int = Query(default=1, ge=1, le=90),
    limit: int = Query(default=10, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """Top referrer sources."""
    return {"referrers": await analytics.get_top_referrers(db, days, limit)}


@router.get("/api/stats/browsers")
async def browsers(
    days: int = Query(default=1, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Browser usage statistics."""
    return {"browsers": await analytics.get_browsers(db, days)}


@router.get("/api/stats/devices")
async def devices(
    days: int = Query(default=1, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Device type statistics."""
    return {"devices": await analytics.get_devices(db, days)}


@router.get("/api/stats/os")
async def operating_systems(
    days: int = Query(default=1, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Operating system statistics."""
    return {"os": await analytics.get_operating_systems(db, days)}


@router.get("/api/stats/countries")
async def countries(
    days: int = Query(default=1, ge=1, le=90),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Visitors by country."""
    return {"countries": await analytics.get_countries(db, days, limit)}


@router.get("/api/stats/cities")
async def cities(
    days: int = Query(default=1, ge=1, le=90),
    limit: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """Visitors by city."""
    return {"cities": await analytics.get_cities(db, days, limit)}


@router.get("/api/stats/live")
async def live(
    limit: int = Query(default=50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """Currently active visitors (last 5 minutes)."""
    return {"visitors": await analytics.get_live_visitors(db, limit)}


@router.get("/api/stats/trends")
async def trends(
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Daily visitor trends for the last N days."""
    return {"trends": await analytics.get_visitor_trends(db, days)}


@router.get("/api/stats/events")
async def events_list(
    days: int = Query(default=1, ge=1, le=90),
    limit: int = Query(default=100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    """Recent events."""
    return {"events": await analytics.get_events(db, days, limit)}


@router.get("/api/stats/events/summary")
async def events_summary(
    days: int = Query(default=1, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
):
    """Event counts grouped by type."""
    return {"events": await analytics.get_event_stats(db, days)}


@router.get("/api/stats/daily")
async def daily(
    days: int = Query(default=30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
):
    """Daily analytics with visitors, page views, sessions, bounce rate."""
    return {"daily": await analytics.get_daily_analytics(db, days)}
