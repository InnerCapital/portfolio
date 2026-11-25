-- Links a trader briefing booking to its Attio deal.
-- Run once in the Supabase SQL editor (same project as handover-app).
-- Until this runs, create-job-folder.js still saves the booking row without
-- the link, so nothing breaks, but Attio won't get trader-side updates.

alter table public.trader_briefing_bookings
  add column if not exists attio_deal_id text;

create index if not exists trader_briefing_bookings_attio_deal_id_idx
  on public.trader_briefing_bookings (attio_deal_id);
