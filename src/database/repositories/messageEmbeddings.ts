import { createHash } from "node:crypto";
import { getSupabaseClient } from "../client.js";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIMENSIONS = 1536;

export type MessageForEmbedding = {
  id: string;
  message_id: string;
  body: string | null;
  embedding_hash: string | null;
};

export type MatchedMessageRow = {
  id: string;
  message_id: string;
  conversation_id: string;
  ebay_conversation_id: string;
  sender: string | null;
  body: string | null;
  is_from_seller: boolean;
  sent_at: string | null;
  similarity: number;
};

export type ConversationMessageRow = {
  id: string;
  message_id: string;
  sender: string | null;
  body: string | null;
  is_from_seller: boolean;
  sent_at: string | null;
};

export function hashMessageBody(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

/** Messages needing a new/updated embedding (null or stale hash). */
export async function listMessagesNeedingEmbeddings(
  limit = 200,
): Promise<MessageForEmbedding[]> {
  const supabase = getSupabaseClient();

  // Fetch a batch with body; filter stale hashes in app for simplicity/portability.
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from("messages")
    .select("id, message_id, body, embedding_hash, embedding")
    .not("body", "is", null)
    .order("sent_at", { ascending: false })
    .limit(limit * 3);

  if (error) {
    throw new Error(`listMessagesNeedingEmbeddings failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<
    MessageForEmbedding & { embedding: unknown }
  >;

  const needing: MessageForEmbedding[] = [];
  for (const row of rows) {
    const body = row.body?.trim();
    if (!body) continue;
    const hash = hashMessageBody(body);
    const missing = row.embedding == null;
    const stale = row.embedding_hash !== hash;
    if (missing || stale) {
      needing.push({
        id: row.id,
        message_id: row.message_id,
        body: row.body,
        embedding_hash: row.embedding_hash,
      });
    }
    if (needing.length >= limit) break;
  }

  return needing;
}

export async function saveMessageEmbedding(input: {
  id: string;
  embedding: number[];
  model: string;
  bodyHash: string;
}): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .schema("ebay_ai")
    .from("messages")
    .update({
      embedding: input.embedding,
      embedding_model: input.model,
      embedding_hash: input.bodyHash,
      embedding_updated_at: new Date().toISOString(),
    })
    .eq("id", input.id);

  if (error) {
    throw new Error(`saveMessageEmbedding failed: ${error.message}`);
  }
}

export async function matchMessagesByEmbedding(input: {
  embedding: number[];
  matchCount: number;
  sellerId?: string | null;
}): Promise<MatchedMessageRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.schema("ebay_ai").rpc("match_messages", {
    query_embedding: input.embedding,
    match_count: input.matchCount,
    filter_seller_id: input.sellerId ?? null,
  });

  if (error) {
    throw new Error(`matchMessagesByEmbedding failed: ${error.message}`);
  }

  return (data ?? []) as MatchedMessageRow[];
}

export async function listMessagesForConversationDbId(
  conversationDbId: string,
): Promise<ConversationMessageRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from("messages")
    .select("id, message_id, sender, body, is_from_seller, sent_at")
    .eq("conversation_id", conversationDbId)
    .order("sent_at", { ascending: true });

  if (error) {
    throw new Error(
      `listMessagesForConversationDbId failed: ${error.message}`,
    );
  }

  return (data ?? []) as ConversationMessageRow[];
}
