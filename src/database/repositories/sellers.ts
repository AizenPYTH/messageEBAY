import { getSupabaseClient } from "../client.js";
import type { SellerRow, UpsertSellerInput } from "../types.js";

const TABLE = "sellers";

export async function upsertSeller(input: UpsertSellerInput): Promise<SellerRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .upsert(
      {
        username: input.username,
        ebay_user_id: input.ebayUserId ?? null,
      },
      { onConflict: "username" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`upsertSeller failed: ${error?.message ?? "unknown"}`);
  }

  return data as SellerRow;
}

export async function getSellerByUsername(
  username: string,
): Promise<SellerRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .select("*")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    throw new Error(`getSellerByUsername failed: ${error.message}`);
  }

  return (data as SellerRow | null) ?? null;
}
