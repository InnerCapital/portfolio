-- Persistent per-unit Asset Register (MOT-style record), independent of any single rental job.

create table assets (
  asset_id text primary key,                    -- e.g. AHUKK250017, stored upper-case
  category text,                                 -- free text, matches unit_type convention already used in inspections
  manufacturer_serial text,
  build_date date,
  depot_location text,
  booqable_stock_item_id text,
  booqable_status text,                          -- manual mirror for now, not written back to Booqable
  booqable_synced_at timestamptz,
  status text check (status in ('pass', 'fail', 'service_due', 'pending_reinspection')) not null default 'pass',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index on assets(status);
create index on assets(category);

-- Unified event timeline for an asset — inspection-app events AND maintenance events, distinguished by `source`.
create table asset_events (
  id uuid primary key default uuid_generate_v4(),
  asset_id text not null references assets(asset_id) on delete cascade,
  source text check (source in ('inspection', 'maintenance')) not null,
  inspection_id uuid references inspections(id),  -- set when source = 'inspection'
  defect_id uuid,                                  -- fk added below once asset_defects exists
  occurred_at timestamptz not null default now(),
  summary text not null,
  resulting_status text check (resulting_status in ('pass', 'fail', 'service_due', 'pending_reinspection')),
  created_at timestamptz default now()
);

-- Defect ledger — populated by both the inspection-completion hook (source_inspection_id /
-- source_checklist_item_id set) and the Zapier maintenance-sheet webhook (zapier_row_id set).
create table asset_defects (
  id uuid primary key default uuid_generate_v4(),
  asset_id text not null references assets(asset_id) on delete cascade,
  source_inspection_id uuid references inspections(id),
  source_checklist_item_id text,                   -- ties back to lib/checklist.ts item ids
  description text not null,
  status text check (status in ('open', 'pending_reinspection', 'resolved')) not null default 'open',
  callout_status text check (callout_status in ('open', 'scheduled', 'in_progress', 'completed', 'cancelled')) default 'open',
  scheduled_date date,
  contractor text,
  completion_date date,
  cost numeric(10,2),
  schedule_l_advisory boolean default false,
  schedule_l_notes text,
  schedule_l_cleared_at timestamptz,
  reinspection_verified_at timestamptz,
  reinspection_inspection_id uuid references inspections(id),
  zapier_row_id text,                               -- external sheet row id, idempotent upsert key
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table asset_events
  add constraint asset_events_defect_id_fkey foreign key (defect_id) references asset_defects(id);

create index on asset_events(asset_id, occurred_at desc);
create index on asset_events(inspection_id);
create index on asset_events(defect_id);

create index on asset_defects(asset_id);
create index on asset_defects(status);
create unique index asset_defects_zapier_row_id_idx on asset_defects(zapier_row_id) where zapier_row_id is not null;
