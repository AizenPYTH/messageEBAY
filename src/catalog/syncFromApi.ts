import { upsertSeller } from "../database/repositories/sellers.js";
import { upsertListing } from "../database/repositories/listings.js";
import { replaceListingVariations } from "../database/repositories/listingVariations.js";
import { getSellerListPage } from "../ebay/sellerListApi.js";
import type { ListingDetails } from "../ebay/tradingApi.js";
import type { CatalogSyncResult } from "./importCsv.js";

function searchTextFromListing(listing: ListingDetails): string {
  const parts = [
    listing.title ?? "",
    listing.condition ?? "",
    listing.categoryName ?? "",
    ...listing.itemSpecifics.flatMap((s) => [s.name, s.value]),
    ...listing.variations.flatMap((v) => [
      v.sku ?? "",
      ...v.specifics.flatMap((s) => [s.name, s.value]),
    ]),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

async function upsertFromListingDetails(input: {
  sellerId: string;
  listing: ListingDetails;
  source: string;
}): Promise<void> {
  const listing = input.listing;
  const status = (listing.listingStatus ?? "Active").toLowerCase();
  const active = status === "active";
  const qtyRaw =
    listing.quantityAvailable ??
    (listing.variations.length
      ? listing.variations.reduce((s, v) => s + v.quantityAvailable, 0)
      : undefined);
  const qty = active ? qtyRaw : 0;

  const row = await upsertListing({
    itemId: listing.itemId,
    sellerId: input.sellerId,
    title: listing.title ?? null,
    description: listing.descriptionText?.slice(0, 2000) ?? null,
    price: listing.price ? Number(listing.price) : null,
    currency: listing.currency ?? null,
    category: listing.categoryName ?? null,
    condition: listing.condition ?? null,
    quantityAvailable: qty ?? null,
    listingStatus: listing.listingStatus ?? (active ? "Active" : "Ended"),
    dispatchTimeMax: listing.dispatchTimeMax ?? null,
    itemUrl: `https://www.ebay.fr/itm/${listing.itemId}`,
    searchText: searchTextFromListing(listing),
    syncedAt: new Date().toISOString(),
    source: input.source,
  });

  await replaceListingVariations(
    row.id,
    listing.variations.map((v) => ({
      listingId: row.id,
      sku: v.sku ?? null,
      specifics: v.specifics,
      quantityAvailable: active ? v.quantityAvailable : 0,
      price: v.price ? Number(v.price) : null,
      searchText: [
        listing.title ?? "",
        v.sku ?? "",
        ...v.specifics.flatMap((s) => [s.name, s.value]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase(),
    })),
  );
}

/** Public wrapper used by live GetItem verify. */
export async function upsertListingLiveFromDetails(input: {
  sellerId: string;
  listing: ListingDetails;
  source: string;
}): Promise<void> {
  return upsertFromListingDetails(input);
}

/**
 * Sync one or more GetSellerList pages into Supabase.
 * Call repeatedly from cron (startPage advances) to stay under timeouts.
 */
export async function syncSellerCatalogFromApi(input: {
  sellerUsername: string;
  startPage?: number;
  maxPages?: number;
}): Promise<CatalogSyncResult & { nextPage: number; totalPages: number }> {
  const seller = await upsertSeller({ username: input.sellerUsername });
  const startPage = input.startPage ?? 1;
  const maxPages = input.maxPages ?? 2;
  let pageNumber = startPage;
  let totalPages = startPage;
  let imported = 0;
  let withVariations = 0;

  for (let i = 0; i < maxPages; i++) {
    const result = await getSellerListPage({ pageNumber, entriesPerPage: 100 });
    if (!result.ok) {
      throw new Error(result.reason);
    }
    totalPages = result.page.totalPages;
    for (const listing of result.page.listings) {
      await upsertFromListingDetails({
        sellerId: seller.id,
        listing,
        source: "get_seller_list",
      });
      imported += 1;
      if (listing.variations.length > 0) withVariations += 1;
    }
    if (pageNumber >= totalPages) {
      pageNumber = totalPages + 1;
      break;
    }
    pageNumber += 1;
  }

  return {
    sellerId: seller.id,
    sellerUsername: input.sellerUsername,
    imported,
    withVariations,
    source: "get_seller_list",
    nextPage: pageNumber > totalPages ? 1 : pageNumber,
    totalPages,
  };
}
