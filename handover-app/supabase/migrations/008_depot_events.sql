-- Depot events (H1 pre-dispatch check, C2 post-return check), alongside the existing
-- site events (H2 delivery/checkout, C1 collection/checkin). Adds a `location`
-- dimension rather than new `type` values, so every existing site-flow code path
-- (Booqable note, PDF title, asset-register summary, customer sign flow) is
-- untouched by default and only branches where depot behaviour genuinely differs.

alter table inspections
  add column if not exists location text check (location in ('depot', 'site')) not null default 'site';

create index if not exists inspections_location_idx on inspections(location);
