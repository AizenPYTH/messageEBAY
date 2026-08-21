import { getSupabaseClient } from "../client.js";

export type AutopilotProcessedRow = {
  conversation_id: string;
  message_fingerprint: string;
  action: string;
  processed_at: string;
};

/**
 * Idempotency: the same incoming buyer message must not be auto-replied twice,
 * even across cron restarts / overlapping runs.
 */
export async function wasMessageProcessed(
  conversationId: string,
  fingerprint: string,
): Promise<boolean> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .schema("ebay_ai")
      .from("autopilot_processed")
      .select("message_fingerprint")
      .eq("conversation_id", conversationId)
      .eq("message_fingerprint", fingerprint)
      .maybeSingle();
    if (error) return false;
    return Boolean(data);
  } catch {
    return false;
  }
}

export async function markMessagesProcessed(input: {
  conversationId: string;
  fingerprints: string[];
  action: "sent" | "skipped";
}): Promise<void> {
  const unique = [...new Set(input.fingerprints.filter(Boolean))];
  if (unique.length === 0) return;
  try {
    const supabase = getSupabaseClient();
    const now = new Date().toISOString();
    const rows = unique.map((fp) => ({
      conversation_id: input.conversationId,
      message_fingerprint: fp,
      action: input.action,
      processed_at: now,
    }));
    await supabase.schema("ebay_ai").from("autopilot_processed").upsert(rows, {
      onConflict: "conversation_id,message_fingerprint",
    });
  } catch {
    // Table may not exist yet — in-memory lock still covers the current run.
  }
}
