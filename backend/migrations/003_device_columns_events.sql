-- =============================================================================
-- Samiksha Analytics — Migration 003: Device info on events
-- =============================================================================
-- Run this in Supabase SQL Editor after 002_semantic_events.sql
-- =============================================================================

-- Device info per event so the activity feed can show browser/OS/device
-- without joining to page_views.
ALTER TABLE events
    ADD COLUMN IF NOT EXISTS browser VARCHAR(100) DEFAULT '',
    ADD COLUMN IF NOT EXISTS os VARCHAR(100) DEFAULT '',
    ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_events_browser ON events(browser);
CREATE INDEX IF NOT EXISTS idx_events_device_type ON events(device_type);

-- Backfill existing rows from the device info captured on their page views
-- (best effort — only fills rows whose visitor has a matching page_view).
UPDATE events e
SET browser = COALESCE(d.browser, ''),
    os = COALESCE(d.os, ''),
    device_type = COALESCE(d.device_type, '')
FROM page_views pv
JOIN devices d ON d.page_view_id = pv.id
WHERE e.visitor_id = pv.visitor_id
  AND (e.browser = '' OR e.browser IS NULL)
  AND d.browser IS NOT NULL;