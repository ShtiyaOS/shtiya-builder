-- Migration: 0003_realtime_publication
-- Phase: T2.3 — Agentic: Pulse — Live Block Assembly Realtime Channel
--
-- Adds the tables that drive the live deal-room experience to Supabase's
-- built-in Realtime publication so that INSERT / UPDATE / DELETE events are
-- broadcast over WebSockets to subscribed clients.
--
-- Tables added:
--   block_committees        — committee status changes (e.g. forming → locked)
--   block_committee_members — individual member signature events
--   deal_room_events        — structured event feed consumed by usePulseChannel
--
-- NOTE: The publication `supabase_realtime` is created automatically by
-- Supabase. Running `alter publication` is idempotent — re-running this
-- migration on a project where the tables are already in the publication
-- is safe (Postgres silently ignores duplicate additions).

alter publication supabase_realtime add table block_committees;
alter publication supabase_realtime add table block_committee_members;
alter publication supabase_realtime add table deal_room_events;
