-- Tracks a Trader Briefing Pack booking from the moment the Hire Agreement is
-- signed in DocuSign through to completion, so the D-10/D-7 reminder system
-- (netlify/functions/send-briefing-reminders.js in trader-briefing)
-- has something to query. Lives in the same Supabase project as the rest of
-- this app's data — the trader-briefing site reuses these credentials rather
-- than standing up separate infrastructure.
--
-- Distinct from 007_trader_briefing_responses.sql: that table is the
-- completion-side record (populated once a trader actually submits their
-- declaration); this one is the pending/in-flight tracker that exists from
-- signing until completion, which nothing previously recorded at all.

-- Extended (before ever being applied) to also track the Screen Artwork
-- step — same booking, same D-minus reminder mechanism, one row per booking
-- rather than a second parallel table. See netlify/functions/submit-artwork.js
-- and send-briefing-reminders.js.

create table trader_briefing_bookings (
  id uuid primary key default uuid_generate_v4(),
  docusign_envelope_id text,
  booqable_ref text,
  company text,
  contact_email text,
  delivery_date date,
  folder_id text,
  briefing_link text,
  status text check (status in ('pending', 'reminded', 'overdue', 'complete')) not null default 'pending',
  last_reminded_at timestamptz,
  artwork_status text check (artwork_status in ('pending', 'reminded_7d', 'reminded_48h', 'skipped', 'complete')) not null default 'pending',
  artwork_completed_at timestamptz,
  artwork_summary text,
  artwork_reminder_7d_sent_at timestamptz,
  artwork_reminder_48h_sent_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on trader_briefing_bookings(status, delivery_date);
create index on trader_briefing_bookings(artwork_status, delivery_date);
create index on trader_briefing_bookings(docusign_envelope_id);
create index on trader_briefing_bookings(booqable_ref);
