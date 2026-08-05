"""
Ingestion service — handles data coming from tracker.js.

This is where we:
1. Parse the incoming JSON
2. Find or create the Visitor record
3. Find or create the Session record
4. Insert the PageView record
5. Insert Device and Location records
"""

from datetime import datetime
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Visitor, Session, PageView, Device, Location
from ..schemas import TrackRequest, EventRequest


async def ingest_page_view(db: AsyncSession, data: TrackRequest) -> None:
    """Process a page view from tracker.js and store it in the database."""

    # 1. Parse the timestamp
    try:
        ts = datetime.fromisoformat(data.timestamp.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        ts = datetime.utcnow()

    # 2. Upsert visitor — create if not exists, update last_seen
    result = await db.execute(
        select(Visitor).where(Visitor.visitor_id == data.visitor_id)
    )
    visitor = result.scalar_one_or_none()
    if visitor is None:
        visitor = Visitor(
            visitor_id=data.visitor_id,
            first_seen=ts,
            last_seen=ts,
        )
        db.add(visitor)
    else:
        visitor.last_seen = ts

    # 3. Upsert session — create if not exists, update page_count
    result = await db.execute(
        select(Session).where(Session.session_id == data.session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        session = Session(
            session_id=data.session_id,
            visitor_id=data.visitor_id,
            started_at=ts,
            entry_page=data.page_url,
            exit_page=data.page_url,
            page_count=1,
            is_bounce=True,
        )
        db.add(session)
    else:
        session.exit_page = data.page_url
        session.page_count += 1
        if session.page_count > 1:
            session.is_bounce = False

    # 4. Insert page view
    page_view = PageView(
        visitor_id=data.visitor_id,
        session_id=data.session_id,
        timestamp=ts,
        page_url=data.page_url,
        page_title=data.page_title,
        referrer=data.referrer,
        is_first_visit=bool(data.is_first_visit),
        scroll_percentage=data.scroll_percentage,
        time_on_page=data.time_on_page,
    )
    db.add(page_view)
    await db.flush()  # Get the page_view.id before inserting related records

    # 5. Insert device info
    device = Device(
        page_view_id=page_view.id,
        browser=data.browser,
        browser_version=data.browser_version,
        os=data.os,
        device_type=data.device_type,
        screen_width=data.screen_width,
        screen_height=data.screen_height,
        language=data.language,
        timezone=data.timezone,
    )
    db.add(device)

    # 6. Insert location (empty for now — can be enriched later with GeoIP)
    location = Location(
        page_view_id=page_view.id,
        country="",
        city="",
    )
    db.add(location)

    # 7. Update session duration
    if data.time_on_page > 0:
        session.duration_seconds = data.time_on_page

    await db.flush()


async def ingest_event(db: AsyncSession, data: EventRequest) -> None:
    """Process an event from tracker.js and store it in the database."""

    try:
        ts = datetime.fromisoformat(data.timestamp.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        ts = datetime.utcnow()

    # Ensure visitor exists
    result = await db.execute(
        select(Visitor).where(Visitor.visitor_id == data.visitor_id)
    )
    visitor = result.scalar_one_or_none()
    if visitor is None:
        visitor = Visitor(
            visitor_id=data.visitor_id,
            first_seen=ts,
            last_seen=ts,
        )
        db.add(visitor)
    else:
        visitor.last_seen = ts

    event = Event(
        visitor_id=data.visitor_id,
        session_id=data.session_id,
        timestamp=ts,
        event_type=data.event_type,
        event_target=data.event_target,
        page_url=data.page_url,
    )
    db.add(event)
    await db.flush()
