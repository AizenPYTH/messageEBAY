import { getSupabaseClient } from "../client.js";
import type { AiReplyRow, InsertAiReplyInput } from "../types.js";

const TABLE = "ai_replies";

export async function insertAiReply(
  input: InsertAiReplyInput,
): Promise<AiReplyRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .insert({
      message_id: input.messageDbId ?? null,
      model: input.model ?? null,
      prompt_version: input.promptVersion ?? null,
      reply: input.reply,
      confidence: input.confidence ?? null,
      sent_to_ebay: input.sentToEbay ?? false,
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`insertAiReply failed: ${error?.message ?? "unknown"}`);
  }

  return data as AiReplyRow;
}
