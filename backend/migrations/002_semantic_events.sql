-- =============================================================================
-- Samiksha Analytics — Migration 002: Semantic events, UTM, journey data
-- =============================================================================
-- Run this in Supabase SQL Editor after 001_initial_schema.sql
-- =============================================================================

-- Structured properties for events (pricing_card_click, cta_click, section_view…)
ALTER TABLE events ADD COLUMN IF NOT EXISTS properties JSONB DEFAULT '{}'::jsonb;
CREATE INDEX IF NOT EXISTS idx_events_properties ON events(properties);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(event_type, timestamp);

-- UTM campaign columns for page views (captured from ?utm_* params)
ALTER TABLE page_views
    ADD COLUMN IF NOT EXISTS utm_source VARCHAR(255) DEFAULT '',
    ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(255) DEFAULT '',
    ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(255) DEFAULT '',
    ADD COLUMN IF NOT EXISTS utm_content VARCHAR(255) DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_pv_utm_source ON page_views(utm_source);
CREATE INDEX IF NOT EXISTS idx_pv_utm_campaign ON page_views(utm_campaign);

-- Source/campaign on sessions (entry attribution for journey analysis)
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS referrer TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS utm_source VARCHAR(255) DEFAULT '',
    ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(255) DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_sessions_referrer ON sessions(referrer);
CREATE INDEX IF NOT EXISTS idx_sessions_utm ON sessions(utm_source, utm_campaign);