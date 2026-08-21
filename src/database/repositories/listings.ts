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
        quantity_available: input.quantityAvailable ?? null,
        listing_status: input.listingStatus ?? null,
        dispatch_time_max: input.dispatchTimeMax ?? null,
        item_url: input.itemUrl ?? null,
        sku: input.sku ?? null,
        search_text: input.searchText ?? null,
        synced_at: input.syncedAt ?? null,
        source: input.source ?? null,
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

export async function getListingByItemId(
  itemId: string,
): Promise<ListingRow | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .select("*")
    .eq("item_id", itemId)
    .maybeSingle();

  if (error) {
    throw new Error(`getListingByItemId failed: ${error.message}`);
  }
  return (data as ListingRow | null) ?? null;
}

/** Title from synced catalog when Trading GetItem is unavailable. */
export async function getCatalogListingTitle(
  itemId: string,
): Promise<string | null> {
  try {
    const row = await getListingByItemId(itemId);
    return row?.title?.trim() || null;
  } catch {
    return null;
  }
}

/** Exact / near-exact title match when Message API has no listing id. */
export async function findCatalogListingByTitle(
  title: string | undefined,
): Promise<ListingRow | null> {
  const t = title?.replace(/\s+/g, " ").trim() ?? "";
  if (t.length < 8) return null;
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .schema("ebay_ai")
      .from(TABLE)
      .select("*")
      .ilike("title", t)
      .limit(5);
    if (error || !data?.length) return null;
    const rows = data as ListingRow[];
    const exact = rows.find(
      (r) => (r.title ?? "").replace(/\s+/g, " ").trim() === t,
    );
    return exact ?? (rows.length === 1 ? rows[0]! : null);
  } catch {
    return null;
  }
}

export async function listCatalogListingsForSeller(
  sellerId: string,
  options?: { limit?: number },
): Promise<ListingRow[]> {
  const supabase = getSupabaseClient();
  const limit = options?.limit ?? 5000;
  const { data, error } = await supabase
    .schema("ebay_ai")
    .from(TABLE)
    .select("*")
    .eq("seller_id", sellerId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`listCatalogListingsForSeller failed: ${error.message}`);
  }
  return (data as ListingRow[]) ?? [];
}

/** Keyword search over seller catalog (title + search_text). */
export async function searchCatalogListings(input: {
  sellerId: string;
  tokens: string[];
  excludeItemId?: string;
  limit?: number;
}): Promise<ListingRow[]> {
  const supabase = getSupabaseClient();
  const limit = input.limit ?? 25;
  const tokens = input.tokens
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2)
    .slice(0, 6);

  if (tokens.length === 0) return [];

  // Broad OR filter on distinctive tokens; score ranks in memory.
  const safeTokens = tokens
    .slice(0, 4)
    .map((t) => t.replace(/[,()%]/g, ""))
    .filter(Boolean);
  if (safeTokens.length === 0) return [];

  const orParts = safeTokens.flatMap((t) => [
    `title.ilike.%${t}%`,
    `search_text.ilike.%${t}%`,
  ]);
  let query = supabase
    .schema("ebay_ai")
    .from(TABLE)
    .select("*")
    .eq("seller_id", input.sellerId)
    .or(orParts.join(","))
    .limit(limit * 3);

  const { data, error } = await query;
  if (error) {
    throw new Error(`searchCatalogListings failed: ${error.message}`);
  }

  let rows = (data as ListingRow[]) ?? [];
  if (input.excludeItemId) {
    rows = rows.filter((r) => r.item_id !== input.excludeItemId);
  }

  // Score in memory: prefer rows matching more tokens + in stock.
  const scored = rows
    .map((row) => {
      const hay = `${row.title ?? ""} ${row.search_text ?? ""}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (hay.includes(token)) score += token.length >= 4 ? 3 : 1;
      }
      if ((row.quantity_available ?? 0) > 0) score += 2;
      return { row, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.row);

  return scored;
}
