"""
Analytics service — all the SQL queries that power the dashboard.

Each function maps to one or more dashboard widgets:
- OverviewStats  → hero cards
- SecondaryStats → secondary cards
- HourlyData     → chart
- TopPage[]      → table
- TopReferrer[]  → table
- BrowserStat[]  → chart
- DeviceStat[]   → chart
- OSStat[]       → chart
- CountryStat[]  → map
- CityStat[]     → table
- LiveVisitor[]  → live feed
- TrendPoint[]   → trend chart
- EventStat[]    → events chart
- DailyStat[]    → daily table
"""

from datetime import datetime, timedelta
from typing import List
from sqlalchemy import select, func, case, distinct, and_, text
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Visitor, Session, PageView, Event, Device, Location


def _today_range():
    now = datetime.utcnow()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    end = start + timedelta(days=1)
    return start, end


def _date_range(days: int):
    now = datetime.utcnow()
    start = now.replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=days - 1)
    end = start + timedelta(days=days)
    return start, end


# =============================================================================
# OVERVIEW STATS
# =============================================================================

async def get_overview_stats(db: AsyncSession) -> dict:
    start, end = _today_range()

    # Visitors today
    q = await db.execute(
        select(func.count(distinct(PageView.visitor_id)))
        .where(and_(PageView.timestamp >= start, PageView.timestamp < end))
    )
    visitors_today = q.scalar() or 0

    # Page views today
    q = await db.execute(
        select(func.count(PageView.id))
        .where(and_(PageView.timestamp >= start, PageView.timestamp < end))
    )
    page_views_today = q.scalar() or 0

    # Sessions today
    q = await db.execute(
        select(func.count(distinct(Session.session_id)))
        .where(and_(Session.started_at >= start, Session.started_at < end))
    )
    sessions_today = q.scalar() or 0

    # Live visitors (active in last 5 minutes)
    five_min_ago = datetime.utcnow() - timedelta(minutes=5)
    q = await db.execute(
        select(func.count(distinct(PageView.visitor_id)))
        .where(PageView.timestamp >= five_min_ago)
    )
    live_visitors = q.scalar() or 0

    return {
        "visitors_today": visitors_today,
        "live_visitors": live_visitors,
        "page_views_today": page_views_today,
        "sessions_today": sessions_today,
    }


# =============================================================================
# SECONDARY STATS
# =============================================================================

async def get_secondary_stats(db: AsyncSession) -> dict:
    start, end = _today_range()

    # Unique visitors today
    q = await db.execute(
        select(func.count(distinct(PageView.visitor_id)))
        .where(and_(PageView.timestamp >= start, PageView.timestamp < end))
    )
    unique_visitors = q.scalar() or 0

    # New visitors today (is_first_visit = True)
    q = await db.execute(
        select(func.count(distinct(PageView.visitor_id)))
        .where(and_(
            PageView.timestamp >= start, PageView.timestamp < end,
            PageView.is_first_visit == True
        ))
    )
    new_visitors = q.scalar() or 0
    returning_visitors = unique_visitors - new_visitors

    # Average session duration today
    q = await db.execute(
        select(func.avg(Session.duration_seconds))
        .where(and_(Session.started_at >= start, Session.started_at < end))
    )
    avg_duration = q.scalar() or 0

    # Bounce rate today
    q = await db.execute(
        select(
            func.count(case((Session.is_bounce == True, 1))),
            func.count(Session.id)
        )
        .where(and_(Session.started_at >= start, Session.started_at < end))
    )
    row = q.one()
    bounce_rate = (row[0] / row[1] * 100) if row[1] > 0 else 0

    # Conversion rate (placeholder — set to 0 until you define a conversion event)
    conversion_rate = 0

    return {
        "unique_visitors_today": unique_visitors,
        "avg_session_duration": round(avg_duration, 1),
        "bounce_rate": round(bounce_rate, 1),
        "conversion_rate": conversion_rate,
        "returning_visitors_today": returning_visitors,
        "new_visitors_today": new_visitors,
    }


# =============================================================================
# HOURLY DATA
# =============================================================================

async def get_hourly_data(db: AsyncSession, days: int = 1) -> List[dict]:
    start, end = _date_range(days)
    q = await db.execute(
        select(
            func.extract("hour", PageView.timestamp).label("hour"),
            func.count(PageView.id).label("visits"),
        )
        .where(and_(PageView.timestamp >= start, PageView.timestamp < end))
        .group_by(text("hour"))
        .order_by(text("hour"))
    )
    return [{"hour": int(r.hour), "visits": r.visits} for r in q.all()]


# =============================================================================
# TOP PAGES
# =============================================================================

async def get_top_pages(db: AsyncSession, days: int = 1, limit: int = 20) -> List[dict]:
    start, end = _date_range(days)
    q = await db.execute(
        select(
            PageView.page_url,
            func.count(PageView.id).label("visits"),
            func.count(distinct(PageView.visitor_id)).label("unique_visitors"),
            func.avg(PageView.time_on_page).label("avg_time"),
            func.avg(PageView.scroll_percentage).label("avg_scroll"),
        )
        .where(and_(PageView.timestamp >= start, PageView.timestamp < end))
        .group_by(PageView.page_url)
        .order_by(text("visits DESC"))
        .limit(limit)
    )
    return [
        {
            "page_url": r.page_url,
            "visits": r.visits,
            "unique_visitors": r.unique_visitors,
            "avg_time_on_page": round(r.avg_time or 0, 1),
            "avg_scroll": round(r.avg_scroll or 0, 1),
        }
        for r in q.all()
    ]


# =============================================================================
# TOP REFERRERS
# =============================================================================

async def get_top_referrers(db: AsyncSession, days: int = 1, limit: int = 10) -> List[dict]:
    start, end = _date_range(days)
    q = await db.execute(
        select(
            PageView.referrer,
            func.count(PageView.id).label("visits"),
        )
        .where(and_(
            PageView.timestamp >= start, PageView.timestamp < end,
            PageView.referrer != "",
            PageView.referrer.isnot(None),
        ))
        .group_by(PageView.referrer)
        .order_by(text("visits DESC"))
        .limit(limit)
    )
    return [{"referrer": r.referrer, "visits": r.visits} for r in q.all()]


# =============================================================================
# BROWSERS
# =============================================================================

async def get_browsers(db: AsyncSession, days: int = 1) -> List[dict]:
    start, end = _date_range(days)
    subq = (
        select(PageView.id)
        .where(and_(PageView.timestamp >= start, PageView.timestamp < end))
    ).subquery()

    q = await db.execute(
        select(
            Device.browser,
            func.count(Device.id).label("count"),
        )
        .join(subq, Device.page_view_id == subq.c.id)
        .where(Device.browser != "")
        .group_by(Device.browser)
        .order_by(text("count DESC"))
    )
    rows = q.all()
    total = sum(r.count for r in rows) or 1
    return [
        {"browser": r.browser, "count": r.count, "percentage": round(r.count / total * 100, 1)}
        for r in rows
    ]


# =============================================================================
# DEVICES
# =============================================================================

async def get_devices(db: AsyncSession, days: int = 1) -> List[dict]:
    start, end = _date_range(days)
    subq = (
        select(PageView.id)
        .where(and_(PageView.timestamp >= start, PageView.timestamp < end))
    ).subquery()

    q = await db.execute(
        select(
            Device.device_type,
            func.count(Device.id).label("count"),
        )
        .join(subq, Device.page_view_id == subq.c.id)
        .where(Device.device_type != "")
        .group_by(Device.device_type)
        .order_by(text("count DESC"))
    )
    rows = q.all()
    total = sum(r.count for r in rows) or 1
    return [
        {"device_type": r.device_type, "count": r.count, "percentage": round(r.count / total * 100, 1)}
        for r in rows
    ]


# =============================================================================
# OPERATING SYSTEMS
# =============================================================================

async def get_operating_systems(db: AsyncSession, days: int = 1) -> List[dict]:
    start, end = _date_range(days)
    subq = (
        select(PageView.id)
        .where(and_(PageView.timestamp >= start, PageView.timestamp < end))
    ).subquery()

    q = await db.execute(
        select(
            Device.os,
            func.count(Device.id).label("count"),
        )
        .join(subq, Device.page_view_id == subq.c.id)
        .where(Device.os != "")
        .group_by(Device.os)
        .order_by(text("count DESC"))
    )
    rows = q.all()
    total = sum(r.count for r in rows) or 1
    return [
        {"os": r.os, "count": r.count, "percentage": round(r.count / total * 100, 1)}
        for r in rows
    ]


# =============================================================================
# LOCATIONS (COUNTRIES + CITIES)
# =============================================================================

async def get_countries(db: AsyncSession, days: int = 1, limit: int = 20) -> List[dict]:
    start, end = _date_range(days)
    subq = (
        select(PageView.id)
        .where(and_(PageView.timestamp >= start, PageView.timestamp < end))
    ).subquery()

    q = await db.execute(
        select(Location.country, func.count(Location.id).label("count"))
        .join(subq, Location.page_view_id == subq.c.id)
        .where(Location.country != "")
        .group_by(Location.country)
        .order_by(text("count DESC"))
        .limit(limit)
    )
    return [{"country": r.country, "count": r.count} for r in q.all()]


async def get_cities(db: AsyncSession, days: int = 1, limit: int = 20) -> List[dict]:
    start, end = _date_range(days)
    subq = (
        select(PageView.id)
        .where(and_(PageView.timestamp >= start, PageView.timestamp < end))
    ).subquery()

    q = await db.execute(
        select(Location.city, Location.country, func.count(Location.id).label("count"))
        .join(subq, Location.page_view_id == subq.c.id)
        .where(Location.city != "")
        .group_by(Location.city, Location.country)
        .order_by(text("count DESC"))
        .limit(limit)
    )
    return [{"city": r.city, "country": r.country, "count": r.count} for r in q.all()]


# =============================================================================
# LIVE VISITORS
# =============================================================================

async def get_live_visitors(db: AsyncSession, limit: int = 50) -> List[dict]:
    five_min_ago = datetime.utcnow() - timedelta(minutes=5)

    q = await db.execute(
        select(PageView, Device, Location)
        .outerjoin(Device, PageView.id == Device.page_view_id)
        .outerjoin(Location, PageView.id == Location.page_view_id)
        .where(PageView.timestamp >= five_min_ago)
        .order_by(PageView.timestamp.desc())
        .limit(limit)
    )
    rows = q.all()

    seen = set()
    visitors = []
    for pv, dev, loc in rows:
        if pv.visitor_id not in seen:
            seen.add(pv.visitor_id)
            visitors.append({
                "visitor_id": pv.visitor_id,
                "last_page": pv.page_url,
                "last_seen": pv.timestamp.isoformat() if pv.timestamp else "",
                "browser": dev.browser if dev else "",
                "os": dev.os if dev else "",
                "device_type": dev.device_type if dev else "",
                "country": loc.country if loc else "",
                "city": loc.city if loc else "",
            })
    return visitors


# =============================================================================
# VISITOR TRENDS (last N days)
# =============================================================================

async def get_visitor_trends(db: AsyncSession, days: int = 30) -> List[dict]:
    start, _ = _date_range(days)
    q = await db.execute(
        select(
            func.date(PageView.timestamp).label("date"),
            func.count(distinct(PageView.visitor_id)).label("visitors"),
            func.count(PageView.id).label("page_views"),
        )
        .where(PageView.timestamp >= start)
        .group_by(text("date"))
        .order_by(text("date"))
    )
    return [
        {"date": str(r.date), "visitors": r.visitors, "page_views": r.page_views, "sessions": 0}
        for r in q.all()
    ]


# =============================================================================
# EVENTS
# =============================================================================

async def get_events(db: AsyncSession, days: int = 1, limit: int = 100) -> List[dict]:
    start, end = _date_range(days)
    q = await db.execute(
        select(Event)
        .where(and_(Event.timestamp >= start, Event.timestamp < end))
        .order_by(Event.timestamp.desc())
        .limit(limit)
    )
    return [
        {
            "visitor_id": e.visitor_id,
            "session_id": e.session_id,
            "timestamp": e.timestamp.isoformat() if e.timestamp else "",
            "event_type": e.event_type,
            "event_target": e.event_target,
            "page_url": e.page_url,
        }
        for e in q.scalars().all()
    ]


async def get_event_stats(db: AsyncSession, days: int = 1) -> List[dict]:
    start, end = _date_range(days)
    q = await db.execute(
        select(Event.event_type, func.count(Event.id).label("count"))
        .where(and_(Event.timestamp >= start, Event.timestamp < end))
        .group_by(Event.event_type)
        .order_by(text("count DESC"))
    )
    return [{"event_type": r.event_type, "count": r.count} for r in q.all()]


# =============================================================================
# DAILY ANALYTICS
# =============================================================================

async def get_daily_analytics(db: AsyncSession, days: int = 30) -> List[dict]:
    start, _ = _date_range(days)
    q = await db.execute(
        select(
            func.date(PageView.timestamp).label("date"),
            func.count(distinct(PageView.visitor_id)).label("visitors"),
            func.count(PageView.id).label("page_views"),
        )
        .where(PageView.timestamp >= start)
        .group_by(text("date"))
        .order_by(text("date"))
    )
    rows = q.all()

    # Compute bounce rate per day
    result = []
    for row in rows:
        day_start = datetime.combine(row.date, datetime.min.time())
        day_end = day_start + timedelta(days=1)

        bq = await db.execute(
            select(
                func.count(case((Session.is_bounce == True, 1))),
                func.count(Session.id),
                func.avg(Session.duration_seconds),
            )
            .where(and_(Session.started_at >= day_start, Session.started_at < day_end))
        )
        brow = bq.one()
        bounce = (brow[0] / brow[1] * 100) if brow[1] > 0 else 0
        result.append({
            "date": str(row.date),
            "visitors": row.visitors,
            "page_views": row.page_views,
            "sessions": brow[1],
            "bounce_rate": round(bounce, 1),
            "avg_duration": round(brow[2] or 0, 1),
        })
    return result
