"""
SQLAlchemy ORM models — one per table.

These map directly to the PostgreSQL tables we create in the migration.
The tracker.js data lands in page_views and events.
"""

import uuid
from datetime import datetime
from sqlalchemy import (
    Column, String, Integer, Float, Boolean, DateTime, Text, ForeignKey, Index
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from ..database.connection import Base


class Visitor(Base):
    __tablename__ = "visitors"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    visitor_id = Column(String(255), unique=True, nullable=False, index=True)
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow)

    sessions = relationship("Session", back_populates="visitor", cascade="all, delete-orphan")
    page_views = relationship("PageView", back_populates="visitor", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="visitor", cascade="all, delete-orphan")


class Session(Base):
    __tablename__ = "sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(String(255), unique=True, nullable=False, index=True)
    visitor_id = Column(String(255), ForeignKey("visitors.visitor_id"), nullable=False, index=True)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)
    entry_page = Column(Text, default="")
    exit_page = Column(Text, default="")
    page_count = Column(Integer, default=1)
    duration_seconds = Column(Float, default=0)
    is_bounce = Column(Boolean, default=True)

    visitor = relationship("Visitor", back_populates="sessions")
    page_views = relationship("PageView", back_populates="session", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_sessions_visitor_id", "visitor_id"),
        Index("idx_sessions_started_at", "started_at"),
    )


class PageView(Base):
    __tablename__ = "page_views"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    visitor_id = Column(String(255), ForeignKey("visitors.visitor_id"), nullable=False, index=True)
    session_id = Column(String(255), ForeignKey("sessions.session_id"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    page_url = Column(Text, nullable=False)
    page_title = Column(Text, default="")
    referrer = Column(Text, default="")
    is_first_visit = Column(Boolean, default=False)
    scroll_percentage = Column(Integer, default=0)
    time_on_page = Column(Float, default=0)

    visitor = relationship("Visitor", back_populates="page_views")
    session = relationship("Session", back_populates="page_views")
    device = relationship("Device", back_populates="page_view", uselist=False, cascade="all, delete-orphan")
    location = relationship("Location", back_populates="page_view", uselist=False, cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_page_views_timestamp", "timestamp"),
        Index("idx_page_views_page_url", "page_url"),
        Index("idx_page_views_visitor_timestamp", "visitor_id", "timestamp"),
    )


class Event(Base):
    __tablename__ = "events"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    visitor_id = Column(String(255), ForeignKey("visitors.visitor_id"), nullable=False, index=True)
    session_id = Column(String(255), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    event_type = Column(String(100), nullable=False, index=True)
    event_target = Column(Text, default="")
    page_url = Column(Text, default="")

    visitor = relationship("Visitor", back_populates="events")

    __table_args__ = (
        Index("idx_events_timestamp", "timestamp"),
        Index("idx_events_event_type", "event_type"),
    )


class Device(Base):
    __tablename__ = "devices"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    page_view_id = Column(UUID(as_uuid=True), ForeignKey("page_views.id"), unique=True, nullable=False)
    browser = Column(String(100), default="")
    browser_version = Column(String(100), default="")
    os = Column(String(100), default="")
    device_type = Column(String(50), default="")
    screen_width = Column(Integer, default=0)
    screen_height = Column(Integer, default=0)
    language = Column(String(50), default="")
    timezone = Column(String(100), default="")

    page_view = relationship("PageView", back_populates="device")

    __table_args__ = (
        Index("idx_devices_browser", "browser"),
        Index("idx_devices_os", "os"),
        Index("idx_devices_device_type", "device_type"),
    )


class Location(Base):
    __tablename__ = "locations"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    page_view_id = Column(UUID(as_uuid=True), ForeignKey("page_views.id"), unique=True, nullable=False)
    country = Column(String(100), default="")
    city = Column(String(100), default="")
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    page_view = relationship("PageView", back_populates="location")

    __table_args__ = (
        Index("idx_locations_country", "country"),
        Index("idx_locations_city", "city"),
    )
