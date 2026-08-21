import { readFile } from "node:fs/promises";
import { upsertSeller } from "../database/repositories/sellers.js";
import { upsertListing } from "../database/repositories/listings.js";
import { replaceListingVariations } from "../database/repositories/listingVariations.js";
import {
  parseEbayActiveListingsCsv,
  type ParsedCatalogListing,
} from "./parseEbayCsv.js";

export type CatalogSyncResult = {
  sellerId: string;
  sellerUsername: string;
  imported: number;
  withVariations: number;
  source: string;
};

function variationSearchText(
  title: string,
  specifics: Array<{ name: string; value: string }>,
  sku?: string,
): string {
  return [title, sku ?? "", ...specifics.flatMap((s) => [s.name, s.value])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export async function upsertCatalogListings(input: {
  sellerUsername: string;
  listings: ParsedCatalogListing[];
  source: string;
}): Promise<CatalogSyncResult> {
  const seller = await upsertSeller({ username: input.sellerUsername });
  const syncedAt = new Date().toISOString();
  let withVariations = 0;
  const batchSize = 40;

  for (let i = 0; i < input.listings.length; i += batchSize) {
    const batch = input.listings.slice(i, i + batchSize);
    for (const listing of batch) {
      const row = await upsertListing({
        itemId: listing.itemId,
        sellerId: seller.id,
        title: listing.title,
        price: listing.price ?? null,
        currency: listing.currency ?? null,
        category: listing.category ?? null,
        condition: listing.condition ?? null,
        quantityAvailable: listing.quantityAvailable,
        listingStatus: "Active",
        itemUrl: listing.itemUrl,
        sku: listing.sku ?? null,
        searchText: listing.searchText,
        syncedAt,
        source: input.source,
      });

      if (listing.variations.length > 0) {
        withVariations += 1;
        await replaceListingVariations(
          row.id,
          listing.variations.map((v) => ({
            listingId: row.id,
            sku: v.sku ?? null,
            specifics: v.specifics,
            quantityAvailable: v.quantityAvailable,
            price: v.price ?? null,
            searchText: variationSearchText(listing.title, v.specifics, v.sku),
          })),
        );
      } else {
        await replaceListingVariations(row.id, []);
      }
    }
    if ((i + batchSize) % 400 === 0 || i + batchSize >= input.listings.length) {
      console.error(
        `catalog import ${Math.min(i + batchSize, input.listings.length)}/${input.listings.length}`,
      );
    }
  }

  return {
    sellerId: seller.id,
    sellerUsername: input.sellerUsername,
    imported: input.listings.length,
    withVariations,
    source: input.source,
  };
}

export async function importCatalogFromCsvFile(input: {
  sellerUsername: string;
  filePath: string;
}): Promise<CatalogSyncResult> {
  const text = await readFile(input.filePath, "utf8");
  const listings = parseEbayActiveListingsCsv(text);
  return upsertCatalogListings({
    sellerUsername: input.sellerUsername,
    listings,
    source: "ebay_csv",
  });
}
