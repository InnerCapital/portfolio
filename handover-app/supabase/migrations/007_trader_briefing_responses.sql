-- Trader Briefing Pack responses (~/Downloads/AH Trader Response Form), migrated off
-- Google Sheets so responses land in the same DB as orders/assets. Dual-written for
-- now — the Netlify function still forwards to the existing Apps Script/Sheet too.

create table trader_briefing_responses (
  id uuid primary key default uuid_generate_v4(),
  company text,
  trading_brand text,
  unit_type text,
  unit_reference text,          -- free text today; matches assets.asset_id when the trader enters it correctly
  event_venue text,
  dates text,                   -- free text as captured by the form, not parsed
  contact_email text,
  signed_date text,
  checklist jsonb,              -- per-item acknowledgment state from the on-page checklist
  signature_image_url text,     -- full-res PNG data URL, same convention as inspections.signature_image_url
  user_agent text,
  booqable_order_id text,       -- nullable — no link from the form today, reserved for future prefill/tie-in
  submitted_at timestamptz not null default now()
);

create index on trader_briefing_responses(unit_reference);
create index on trader_briefing_responses(submitted_at desc);
