-- Idempotency for autopilot: one incoming buyer message → at most one auto reply.
create table if not exists ebay_ai.autopilot_processed (
  conversation_id text not null,
  message_fingerprint text not null,
  action text not null default 'sent',
  processed_at timestamptz not null default now(),
  primary key (conversation_id, message_fingerprint)
);

create index if not exists autopilot_processed_processed_at_idx
  on ebay_ai.autopilot_processed (processed_at desc);

alter table ebay_ai.autopilot_processed enable row level security;

grant all on table ebay_ai.autopilot_processed to postgres, service_role;

notify pgrst, 'reload schema';
