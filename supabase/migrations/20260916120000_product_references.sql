-- Références produit : ce qu'un code constructeur désigne réellement.
-- La table statique du code reste la source sûre ; cette table garde ce que
-- l'on apprend du marché (Browse API) pour ne pas le réapprendre à chaque run.

create table if not exists ebay_ai.product_references (
  code text primary key,
  brand text not null,
  family text not null,
  base text not null,
  qualifiers text[] not null default '{}',
  network text,
  label text not null,
  source text not null default 'marketplace',
  confidence numeric,
  samples jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists product_references_product_idx
  on ebay_ai.product_references (brand, family, base);
