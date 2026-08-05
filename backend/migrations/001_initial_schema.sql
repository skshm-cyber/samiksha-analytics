-- =============================================================================
-- Samiksha Analytics — PostgreSQL Schema (Supabase)
-- =============================================================================
-- Run this in Supabase SQL Editor:
--   Dashboard → SQL Editor → New Query → Paste this → Run
-- =============================================================================

-- Visitors — one row per unique visitor (identified by browser localStorage)
CREATE TABLE IF NOT EXISTS visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id VARCHAR(255) UNIQUE NOT NULL,
    first_seen TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_visitors_visitor_id ON visitors(visitor_id);

-- Sessions — one row per browsing session (identified by browser sessionStorage)
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    visitor_id VARCHAR(255) NOT NULL REFERENCES visitors(visitor_id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    entry_page TEXT DEFAULT '',
    exit_page TEXT DEFAULT '',
    page_count INTEGER DEFAULT 1,
    duration_seconds REAL DEFAULT 0,
    is_bounce BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_sessions_session_id ON sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_sessions_visitor_id ON sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

-- Page views — one row per page load
CREATE TABLE IF NOT EXISTS page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id VARCHAR(255) NOT NULL REFERENCES visitors(visitor_id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    page_url TEXT NOT NULL,
    page_title TEXT DEFAULT '',
    referrer TEXT DEFAULT '',
    is_first_visit BOOLEAN DEFAULT FALSE,
    scroll_percentage INTEGER DEFAULT 0,
    time_on_page REAL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_pv_timestamp ON page_views(timestamp);
CREATE INDEX IF NOT EXISTS idx_pv_page_url ON page_views(page_url);
CREATE INDEX IF NOT EXISTS idx_pv_visitor_ts ON page_views(visitor_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_pv_session ON page_views(session_id);

-- Events — button clicks, form submits, downloads, etc.
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id VARCHAR(255) NOT NULL REFERENCES visitors(visitor_id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    event_type VARCHAR(100) NOT NULL,
    event_target TEXT DEFAULT '',
    page_url TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_visitor ON events(visitor_id);

-- Devices — browser, OS, screen info per page view
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_view_id UUID UNIQUE NOT NULL REFERENCES page_views(id) ON DELETE CASCADE,
    browser VARCHAR(100) DEFAULT '',
    browser_version VARCHAR(100) DEFAULT '',
    os VARCHAR(100) DEFAULT '',
    device_type VARCHAR(50) DEFAULT '',
    screen_width INTEGER DEFAULT 0,
    screen_height INTEGER DEFAULT 0,
    language VARCHAR(50) DEFAULT '',
    timezone VARCHAR(100) DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_dev_pv ON devices(page_view_id);
CREATE INDEX IF NOT EXISTS idx_dev_browser ON devices(browser);
CREATE INDEX IF NOT EXISTS idx_dev_os ON devices(os);
CREATE INDEX IF NOT EXISTS idx_dev_type ON devices(device_type);

-- Locations — country, city per page view (enriched later via GeoIP)
CREATE TABLE IF NOT EXISTS locations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_view_id UUID UNIQUE NOT NULL REFERENCES page_views(id) ON DELETE CASCADE,
    country VARCHAR(100) DEFAULT '',
    city VARCHAR(100) DEFAULT '',
    latitude REAL,
    longitude REAL
);
CREATE INDEX IF NOT EXISTS idx_loc_pv ON locations(page_view_id);
CREATE INDEX IF NOT EXISTS idx_loc_country ON locations(country);
CREATE INDEX IF NOT EXISTS idx_loc_city ON locations(city);
