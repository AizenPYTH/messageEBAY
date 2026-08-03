-- Étape 9 — profil vendeur (mémoire permanente)

create table if not exists ebay_ai.seller_profiles (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references ebay_ai.sellers (id) on delete cascade,
  display_name text,
  languages text[] not null default '{}',
  response_style text,
  shipping_policy text,
  return_policy text,
  refund_policy text,
  negotiation_policy text,
  tone text,
  signature text,
  custom_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint seller_profiles_seller_id_unique unique (seller_id)
);

create index if not exists seller_profiles_seller_id_idx
  on ebay_ai.seller_profiles (seller_id);

alter table ebay_ai.seller_profiles enable row level security;

grant all on table ebay_ai.seller_profiles to postgres, service_role;
grant select on table ebay_ai.seller_profiles to authenticated;

notify pgrst, 'reload schema';
