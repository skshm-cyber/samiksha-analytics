"""
Pydantic schemas — request validation and response models.

When tracker.js sends JSON to POST /api/track, FastAPI validates it
against TrackRequest. If a required field is missing, the API returns
a clear 422 error instead of silently saving bad data.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# =============================================================================
# INGESTION — data from tracker.js
# =============================================================================

class TrackRequest(BaseModel):
    """Schema for POST /api/track — page view data from tracker.js."""
    visitor_id: str = Field(..., min_length=1)
    session_id: str = Field(..., min_length=1)
    timestamp: str
    timezone: Optional[str] = ""
    language: Optional[str] = ""
    browser: Optional[str] = ""
    browser_version: Optional[str] = ""
    os: Optional[str] = ""
    device_type: Optional[str] = ""
    screen_width: Optional[int] = 0
    screen_height: Optional[int] = 0
    page_url: str = Field(..., min_length=1)
    referrer: Optional[str] = ""
    page_title: Optional[str] = ""
    is_first_visit: Optional[int] = 0
    scroll_percentage: Optional[int] = 0
    time_on_page: Optional[float] = 0


class EventRequest(BaseModel):
    """Schema for POST /api/event — interaction data from tracker.js."""
    visitor_id: str = Field(..., min_length=1)
    session_id: str = Field(..., min_length=1)
    timestamp: str
    event_type: str = Field(..., min_length=1)
    event_target: Optional[str] = ""
    page_url: Optional[str] = ""


class IngestionResponse(BaseModel):
    """Standard response for ingestion endpoints."""
    status: str = "ok"


# =============================================================================
# ANALYTICS — dashboard responses
# =============================================================================

class OverviewStats(BaseModel):
    """Hero cards: visitors today, live, page views, sessions."""
    visitors_today: int = 0
    live_visitors: int = 0
    page_views_today: int = 0
    sessions_today: int = 0


class SecondaryStats(BaseModel):
    """Secondary cards: unique, duration, bounce rate, conversion, returning, new."""
    unique_visitors_today: int = 0
    avg_session_duration: float = 0
    bounce_rate: float = 0
    conversion_rate: float = 0
    returning_visitors_today: int = 0
    new_visitors_today: int = 0


class HourlyData(BaseModel):
    hour: int
    visits: int


class TopPage(BaseModel):
    page_url: str
    visits: int
    unique_visitors: int
    avg_time_on_page: float = 0
    avg_scroll: float = 0


class TopReferrer(BaseModel):
    referrer: str
    visits: int


class BrowserStat(BaseModel):
    browser: str
    count: int
    percentage: float = 0


class DeviceStat(BaseModel):
    device_type: str
    count: int
    percentage: float = 0


class OSStat(BaseModel):
    os: str
    count: int
    percentage: float = 0


class CountryStat(BaseModel):
    country: str
    count: int


class CityStat(BaseModel):
    city: str
    country: str
    count: int


class LiveVisitor(BaseModel):
    visitor_id: str
    last_page: str
    last_seen: str
    browser: str = ""
    os: str = ""
    device_type: str = ""
    country: str = ""
    city: str = ""


class TrendPoint(BaseModel):
    date: str
    visitors: int
    page_views: int
    sessions: int


class EventStat(BaseModel):
    event_type: str
    count: int


class DailyStat(BaseModel):
    date: str
    visitors: int
    page_views: int
    sessions: int
    bounce_rate: float = 0
    avg_duration: float = 0
