-- Seller-facing alerts: escalate to human, digests, status tracking

create table if not exists ebay_ai.seller_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references ebay_ai.app_profiles (id) on delete set null,
  conversation_id text not null,
  buyer_username text,
  listing_title text,
  alert_type text not null,
  reason text not null,
  buyer_message text,
  message_count integer,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists seller_alerts_status_created_idx
  on ebay_ai.seller_alerts (status, created_at desc);

create index if not exists seller_alerts_conversation_idx
  on ebay_ai.seller_alerts (conversation_id);

alter table ebay_ai.seller_alerts enable row level security;

grant all on table ebay_ai.seller_alerts to postgres, service_role;
grant select on table ebay_ai.seller_alerts to authenticated;

notify pgrst, 'reload schema';
