import { getSupabaseClient } from "../client.js";

export type SellerAlertRow = {
  id: string;
  user_id: string | null;
  conversation_id: string;
  buyer_username: string | null;
  listing_title: string | null;
  alert_type: string;
  reason: string;
  buyer_message: string | null;
  message_count: number | null;
  status: string;
  created_at: string;
  resolved_at: string | null;
};

export type InsertSellerAlertInput = {
  userId?: string | null;
  conversationId: string;
  buyerUsername?: string | null;
  listingTitle?: string | null;
  alertType: string;
  reason: string;
  buyerMessage?: string | null;
  messageCount?: number | null;
};

export async function insertSellerAlert(
  input: InsertSellerAlertInput,
): Promise<SellerAlertRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from("seller_alerts")
    .insert({
      user_id: input.userId ?? null,
      conversation_id: input.conversationId,
      buyer_username: input.buyerUsername ?? null,
      listing_title: input.listingTitle ?? null,
      alert_type: input.alertType,
      reason: input.reason,
      buyer_message: input.buyerMessage ?? null,
      message_count: input.messageCount ?? null,
      status: "open",
    })
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`insertSellerAlert failed: ${error?.message ?? "unknown"}`);
  }
  return data as SellerAlertRow;
}

export async function listOpenSellerAlerts(
  limit = 50,
): Promise<SellerAlertRow[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from("seller_alerts")
    .select("*")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`listOpenSellerAlerts failed: ${error.message}`);
  }
  return (data as SellerAlertRow[]) ?? [];
}

export async function resolveSellerAlert(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .schema("ebay_ai")
    .from("seller_alerts")
    .update({
      status: "resolved",
      resolved_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`resolveSellerAlert failed: ${error.message}`);
  }
}

/** Avoid spamming identical open alerts for the same conversation+type. */
export async function hasOpenAlert(
  conversationId: string,
  alertType: string,
): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from("seller_alerts")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("alert_type", alertType)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`hasOpenAlert failed: ${error.message}`);
  }
  return Boolean(data);
}
