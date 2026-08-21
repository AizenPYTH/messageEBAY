-- Catalogue vendeur: stock + variantes pour recherche cross-annonces

alter table ebay_ai.listings
  add column if not exists quantity_available integer,
  add column if not exists listing_status text,
  add column if not exists dispatch_time_max text,
  add column if not exists item_url text,
  add column if not exists sku text,
  add column if not exists search_text text,
  add column if not exists synced_at timestamptz,
  add column if not exists source text;

create table if not exists ebay_ai.listing_variations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references ebay_ai.listings (id) on delete cascade,
  sku text,
  specifics jsonb not null default '[]'::jsonb,
  quantity_available integer not null default 0,
  price numeric,
  search_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists listing_variations_listing_id_idx
  on ebay_ai.listing_variations (listing_id);

create index if not exists listings_search_text_idx
  on ebay_ai.listings using gin (to_tsvector('simple', coalesce(search_text, '')));

create index if not exists listings_quantity_available_idx
  on ebay_ai.listings (seller_id, quantity_available);

create index if not exists listing_variations_search_text_idx
  on ebay_ai.listing_variations using gin (to_tsvector('simple', coalesce(search_text, '')));

alter table ebay_ai.listing_variations enable row level security;

grant all on ebay_ai.listing_variations to postgres, service_role;
grant select on ebay_ai.listing_variations to authenticated;

notify pgrst, 'reload schema';
