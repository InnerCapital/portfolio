alter table inspections
  add column if not exists units jsonb default '[]';
