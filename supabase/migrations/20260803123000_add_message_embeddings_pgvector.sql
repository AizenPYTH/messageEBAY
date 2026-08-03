-- Étape 8 — embeddings messages (pgvector) pour RAG

create extension if not exists vector;

alter table ebay_ai.messages
  add column if not exists embedding vector(1536),
  add column if not exists embedding_model text,
  add column if not exists embedding_hash text,
  add column if not exists embedding_updated_at timestamptz;

create index if not exists messages_embedding_hnsw_idx
  on ebay_ai.messages
  using hnsw (embedding vector_cosine_ops);

create index if not exists messages_embedding_null_idx
  on ebay_ai.messages (id)
  where embedding is null;

create or replace function ebay_ai.match_messages(
  query_embedding vector(1536),
  match_count integer default 5,
  filter_seller_id uuid default null
)
returns table (
  id uuid,
  message_id text,
  conversation_id uuid,
  ebay_conversation_id text,
  sender text,
  body text,
  is_from_seller boolean,
  sent_at timestamptz,
  similarity double precision
)
language sql
stable
as $$
  select
    m.id,
    m.message_id,
    m.conversation_id,
    c.conversation_id as ebay_conversation_id,
    m.sender,
    m.body,
    m.is_from_seller,
    m.sent_at,
    (1 - (m.embedding <=> query_embedding))::double precision as similarity
  from ebay_ai.messages m
  inner join ebay_ai.conversations c on c.id = m.conversation_id
  where m.embedding is not null
    and coalesce(m.body, '') <> ''
    and m.is_from_seller = false
    and (filter_seller_id is null or c.seller_id = filter_seller_id)
  order by m.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;

grant execute on function ebay_ai.match_messages(vector, integer, uuid) to service_role;

notify pgrst, 'reload schema';
