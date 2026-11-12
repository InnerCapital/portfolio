alter table inspections
  add column if not exists customer_email text,
  add column if not exists link_sent_at timestamptz;
