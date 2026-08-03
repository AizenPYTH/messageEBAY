-- SaaS auth: app profiles + per-user provider connections (eBay tokens encrypted at app layer)

create table if not exists ebay_ai.app_profiles (
  id uuid primary key,
  email text,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ebay_ai.user_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references ebay_ai.app_profiles (id) on delete cascade,
  provider text not null,
  provider_user_id text,
  provider_username text,
  access_token_enc text not null,
  refresh_token_enc text,
  expires_at timestamptz,
  scopes text,
  last_tested_at timestamptz,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_connections_user_provider_unique unique (user_id, provider)
);

create index if not exists user_connections_user_id_idx
  on ebay_ai.user_connections (user_id);

create index if not exists user_connections_provider_username_idx
  on ebay_ai.user_connections (provider_username);

alter table ebay_ai.app_profiles enable row level security;
alter table ebay_ai.user_connections enable row level security;

grant all on table ebay_ai.app_profiles to postgres, service_role;
grant all on table ebay_ai.user_connections to postgres, service_role;
grant select on table ebay_ai.app_profiles to authenticated;
grant select on table ebay_ai.user_connections to authenticated;

notify pgrst, 'reload schema';
