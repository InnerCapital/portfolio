create extension if not exists "uuid-ossp";

create table inspections (
  id uuid primary key default uuid_generate_v4(),
  booqable_order_id text,
  type text check (type in ('checkout', 'checkin')) default 'checkout',
  status text check (status in ('draft', 'awaiting_signature', 'signed', 'complete')) default 'draft',

  -- Customer details (from Booqable)
  customer_name text,
  company_name text,
  site_address text,
  unit_type text,
  rental_start date,
  rental_end date,

  -- Delivery details
  delivery_date date,
  delivery_time time,
  power_connected boolean,
  power_notes text,
  general_notes text,

  -- Checklist (JSON object of item_id: 'pass' | 'issue', plus notes)
  checklist jsonb default '{}',

  -- Photos (array of {id, label, url, timestamp, lat, lng})
  photos jsonb default '[]',

  -- Signing
  customer_sign_token uuid default uuid_generate_v4(),
  signer_name text,
  signer_position text,
  signature_image_url text,
  signed_at timestamptz,

  -- Outputs
  pdf_url text,
  drive_folder_id text,
  booqable_note_id text,

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Index for token lookup
create unique index on inspections(customer_sign_token);
create index on inspections(booqable_order_id);
