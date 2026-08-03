import { getSupabaseClient } from "../client.js";
import type { ConversationRow, UpsertConversationInput } from "../types.js";

const TABLE = "conversations";

export async function upsertConversation(
  input: UpsertConversationInput,
): Promise<ConversationRow> {
  const supabase = getSupabaseClient();
  const payload: Record<string, unknown> = {
    conversation_id: input.conversationId,
    seller_id: input.sellerId ?? null,
    listing_id: input.listingId ?? null,
    other_party: input.otherParty ?? null,
    updated_at: new Date().toISOString(),
  };

  if (input.createdAt) {
    payload.created_at = input.createdAt;
  }

  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .upsert(payload, { onConflict: "conversation_id" })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(
      `upsertConversation failed: ${error?.message ?? "unknown"}`,
    );
  }

  return data as ConversationRow;
}
