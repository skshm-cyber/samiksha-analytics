-- =============================================================================
-- Samiksha Analytics — Migration 004: Row Level Security (RLS)
-- =============================================================================
-- Run this in Supabase SQL Editor after 003_device_columns_events.sql
-- =============================================================================
-- Security hardening: all tables currently have RLS DISABLED, meaning anyone
-- holding the anon key could read/write/DELETE every row directly via the
-- REST API. This formalizes the app's real needs as policies:
--
--   anon  SELECT  → analytics queries (dashboard, funnels, journeys…)
--   anon  INSERT  → tracking ingestion (visitors, sessions, page_views, …)
--   anon  UPDATE  → page_leave patching (time_on_page, scroll, session duration)
--   anon  DELETE  → NOT granted (no app path deletes data)
--
-- No application code changes are required — the worker already uses the anon
-- key for exactly these operations, so this is strictly a restriction.

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['visitors','sessions','page_views','events','devices','locations'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);

    EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO anon USING (true);', t || '_select', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR INSERT TO anon WITH CHECK (true);', t || '_insert', t);
    EXECUTE format('CREATE POLICY %I ON %I FOR UPDATE TO anon USING (true) WITH CHECK (true);', t || '_update', t);
  END LOOP;
END $$;
