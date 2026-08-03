import { getSupabaseClient } from "../client.js";
import type { ListingRow, UpsertListingInput } from "../types.js";

const TABLE = "listings";

export async function upsertListing(
  input: UpsertListingInput,
): Promise<ListingRow> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .upsert(
      {
        item_id: input.itemId,
        seller_id: input.sellerId ?? null,
        title: input.title ?? null,
        description: input.description ?? null,
        price: input.price ?? null,
        currency: input.currency ?? null,
        category: input.category ?? null,
        condition: input.condition ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "item_id" },
    )
    .select("*")
    .single();

  if (error || !data) {
    throw new Error(`upsertListing failed: ${error?.message ?? "unknown"}`);
  }

  return data as ListingRow;
}
