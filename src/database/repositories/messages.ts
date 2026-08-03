import { getSupabaseClient } from "../client.js";
import type { MessageRow, UpsertMessageInput } from "../types.js";

const TABLE = "messages";

export async function upsertMessage(
  input: UpsertMessageInput,
): Promise<MessageRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .upsert(
      {
        message_id: input.messageId,
        conversation_id: input.conversationDbId,
        sender: input.sender ?? null,
        sent_at: input.sentAt ?? null,
        body: input.body ?? null,
        is_from_seller: input.isFromSeller,
      },
      { onConflict: "message_id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`upsertMessage failed: ${error?.message ?? "unknown"}`);
  }

  return data as MessageRow;
}

export async function upsertMessages(
  inputs: UpsertMessageInput[],
): Promise<MessageRow[]> {
  const results: MessageRow[] = [];
  for (const input of inputs) {
    results.push(await upsertMessage(input));
  }
  return results;
}
