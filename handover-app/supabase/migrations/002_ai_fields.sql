alter table inspections
  add column if not exists ai_photo_checks jsonb default '[]',
  add column if not exists ai_comparisons jsonb default '[]',
  add column if not exists ai_overrides jsonb default '[]',
  add column if not exists dispute_summary text;
