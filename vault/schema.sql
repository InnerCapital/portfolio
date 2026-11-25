create table if not exists entries (
  id uuid primary key,
  name text not null,
  category text not null default 'General',
  purpose text not null default '',
  login_url text not null default '',
  login_method text not null default 'Password',
  username text not null default '',
  password_enc text,
  owner text not null default '',
  admins text not null default '',
  access text not null default '',
  two_fa text not null default '',
  billing text not null default '',
  notes text not null default '',
  restricted boolean not null default false,
  shared_with text not null default '',
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  entry_id uuid,
  entry_name text,
  detail text not null default ''
);

create index if not exists audit_log_at_idx on audit_log (at desc);
create index if not exists audit_log_actor_action_idx on audit_log (actor, action, at desc);

-- Two-step sign-in (authenticator app). The app also creates these on first use.
create table if not exists mfa_factors (
  email text primary key,
  secret_enc text not null,
  enabled boolean not null default false,
  last_used_step bigint,
  created_at timestamptz not null default now(),
  enabled_at timestamptz
);

create table if not exists mfa_recovery_codes (
  id bigserial primary key,
  email text not null,
  code_hash text not null,
  used_at timestamptz
);

create index if not exists mfa_recovery_codes_email_idx on mfa_recovery_codes (email);
