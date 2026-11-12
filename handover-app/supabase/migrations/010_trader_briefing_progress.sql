-- Backend-persisted "save your place" for the Trader Briefing Pack form
-- (trader-briefing/index.html). Previously localStorage-only,
-- which only resumes on the same browser/device the trader started on —
-- a real gap given traders come back via D-7/D-2 reminder emails that may
-- well be opened on a different device. Same row this app already tracks
-- per booking (see 009_trader_briefing_bookings.sql), keyed by folder_id
-- (always set once create-job-folder.js runs) rather than a new table.
alter table trader_briefing_bookings
  add column progress_snapshot jsonb,
  add column progress_updated_at timestamptz;
