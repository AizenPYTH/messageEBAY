import { getSupabaseClient } from "../client.js";
import type {
  ListingVariationRow,
  UpsertListingVariationInput,
} from "../types.js";

const TABLE = "listing_variations";

export async function replaceListingVariations(
  listingId: string,
  variations: UpsertListingVariationInput[],
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error: delError } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .delete()
    .eq("listing_id", listingId);

  if (delError) {
    throw new Error(`replaceListingVariations delete failed: ${delError.message}`);
  }

  if (variations.length === 0) return;

  const now = new Date().toISOString();
  const rows = variations.map((v) => ({
    listing_id: listingId,
    sku: v.sku ?? null,
    specifics: v.specifics,
    quantity_available: v.quantityAvailable,
    price: v.price ?? null,
    search_text: v.searchText ?? null,
    updated_at: now,
  }));

  const { error } = await supabase.schema("ebay_ai").from(TABLE).insert(rows);
  if (error) {
    throw new Error(`replaceListingVariations insert failed: ${error.message}`);
  }
}

export async function listVariationsForListingIds(
  listingIds: string[],
): Promise<ListingVariationRow[]> {
  if (listingIds.length === 0) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .select("*")
    .in("listing_id", listingIds);

  if (error) {
    throw new Error(`listVariationsForListingIds failed: ${error.message}`);
  }

  return ((data as ListingVariationRow[]) ?? []).map((row) => ({
    ...row,
    specifics: Array.isArray(row.specifics) ? row.specifics : [],
  }));
}
