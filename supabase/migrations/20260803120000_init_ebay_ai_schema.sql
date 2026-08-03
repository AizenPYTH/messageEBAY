-- Étape 7 — schéma isolé ebay_ai (prêt RAG / SaaS)
-- Hébergé temporairement sur un projet existant si la limite free empêche un projet dédié.

create extension if not exists "pgcrypto";

create schema if not exists ebay_ai;

create table if not exists ebay_ai.sellers (
  id uuid primary key default gen_random_uuid(),
  ebay_user_id text,
  username text not null,
  created_at timestamptz not null default now(),
  constraint sellers_username_unique unique (username)
);

create table if not exists ebay_ai.listings (
  id uuid primary key default gen_random_uuid(),
  item_id text not null,
  seller_id uuid references ebay_ai.sellers (id) on delete set null,
  title text,
  description text,
  price numeric,
  currency text,
  category text,
  condition text,
  updated_at timestamptz not null default now(),
  constraint listings_item_id_unique unique (item_id)
);

create table if not exists ebay_ai.conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  seller_id uuid references ebay_ai.sellers (id) on delete set null,
  listing_id uuid references ebay_ai.listings (id) on delete set null,
  other_party text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_conversation_id_unique unique (conversation_id)
);

create table if not exists ebay_ai.messages (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  conversation_id uuid not null references ebay_ai.conversations (id) on delete cascade,
  sender text,
  sent_at timestamptz,
  body text,
  is_from_seller boolean not null default false,
  created_at timestamptz not null default now(),
  constraint messages_message_id_unique unique (message_id)
);

create table if not exists ebay_ai.ai_replies (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references ebay_ai.messages (id) on delete set null,
  model text,
  prompt_version text,
  reply text not null,
  confidence numeric,
  sent_to_ebay boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists listings_seller_id_idx on ebay_ai.listings (seller_id);
create index if not exists conversations_seller_id_idx on ebay_ai.conversations (seller_id);
create index if not exists conversations_listing_id_idx on ebay_ai.conversations (listing_id);
create index if not exists messages_conversation_id_idx on ebay_ai.messages (conversation_id);
create index if not exists messages_sent_at_idx on ebay_ai.messages (sent_at);
create index if not exists ai_replies_message_id_idx on ebay_ai.ai_replies (message_id);

alter table ebay_ai.sellers enable row level security;
alter table ebay_ai.listings enable row level security;
alter table ebay_ai.conversations enable row level security;
alter table ebay_ai.messages enable row level security;
alter table ebay_ai.ai_replies enable row level security;

grant usage on schema ebay_ai to postgres, anon, authenticated, service_role;
grant all on all tables in schema ebay_ai to postgres, service_role;
grant select on all tables in schema ebay_ai to authenticated;
grant all on all sequences in schema ebay_ai to postgres, service_role;

notify pgrst, 'reload schema';
