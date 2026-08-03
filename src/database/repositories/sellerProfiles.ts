import { getSupabaseClient } from "../client.js";
import type {
  SellerProfileRow,
  UpsertSellerProfileInput,
} from "../types.js";

const TABLE = "seller_profiles";

export async function getSellerProfileBySellerId(
  sellerId: string,
): Promise<SellerProfileRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .select("*")
    .eq("seller_id", sellerId)
    .maybeSingle();

  if (error) {
    throw new Error(`getSellerProfileBySellerId failed: ${error.message}`);
  }

  return (data as SellerProfileRow | null) ?? null;
}

export async function upsertSellerProfile(
  input: UpsertSellerProfileInput,
): Promise<SellerProfileRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .upsert(
      {
        seller_id: input.sellerId,
        display_name: input.displayName ?? null,
        languages: input.languages ?? [],
        response_style: input.responseStyle ?? null,
        shipping_policy: input.shippingPolicy ?? null,
        return_policy: input.returnPolicy ?? null,
        refund_policy: input.refundPolicy ?? null,
        negotiation_policy: input.negotiationPolicy ?? null,
        tone: input.tone ?? null,
        signature: input.signature ?? null,
        custom_instructions: input.customInstructions ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "seller_id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`upsertSellerProfile failed: ${error?.message ?? "unknown"}`);
  }

  return data as SellerProfileRow;
}
