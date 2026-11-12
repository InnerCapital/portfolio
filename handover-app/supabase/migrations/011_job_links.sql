-- One-off job links for site checks (H2 delivery, C1 collection). Staff create a
-- link; whoever opens it (customer or courier) can complete only that
-- inspection's photo and checklist steps. The link expires, and stops working
-- once the checklist is submitted (job_link_used_at).

alter table inspections
  add column if not exists job_link_token text,
  add column if not exists job_link_expires_at timestamptz,
  add column if not exists job_link_used_at timestamptz,
  add column if not exists job_link_created_by text;

create unique index if not exists inspections_job_link_token_idx
  on inspections(job_link_token) where job_link_token is not null;
