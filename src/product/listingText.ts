/**
 * Everything a listing says about what it is.
 *
 * Product matching used to read the title alone, which loses the service code
 * when the seller put it in the item specifics or the variation SKU instead —
 * exactly where eBay encourages sellers to put it.
 */

import type { ListingDetails } from "../ebay/tradingApi.js";

export function listingIdentityText(listing: ListingDetails | undefined): string {
  if (!listing) return "";
  return [
    listing.title ?? "",
    listing.subtitle ?? "",
    listing.sku ?? "",
    ...(listing.itemSpecifics ?? []).map((s) => `${s.name} ${s.value}`),
    ...(listing.compatibility ?? []).map(
      (c) => `${c.specifics.map((s) => `${s.name} ${s.value}`).join(" ")} ${c.notes ?? ""}`,
    ),
    ...(listing.variations ?? []).flatMap((v) => [
      v.sku ?? "",
      ...v.specifics.map((s) => `${s.name} ${s.value}`),
    ]),
    // The description often repeats the codes the title had no room for.
    (listing.descriptionText ?? "").slice(0, 1500),
  ]
    .filter((part) => part.trim())
    .join(" \n ");
}
