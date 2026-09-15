import { getSellerByUsername } from "../database/repositories/sellers.js";
import {
  extractAskedModelLabel,
  matchListingVariation,
} from "../analysis/listingEvidence.js";
import {
  extractAskedIdentity,
  identityMatchesText,
  isEmptyIdentity,
} from "../product/identity.js";
import type { ListingVariation } from "../ebay/tradingApi.js";
import { getListingDetails } from "../ebay/tradingApi.js";
import {
  extractApplePartNumbers,
  variationMentionsApplePart,
} from "./appleParts.js";
import { upsertListingLiveFromDetails } from "./syncFromApi.js";
import type { CatalogHit } from "./searchCatalog.js";

function matchVariationByApplePart(
  listing: { variations: ListingVariation[] },
  part: string,
): ListingVariation | null {
  const matched = listing.variations.filter((v) =>
    variationMentionsApplePart(v, part),
  );
  if (matched.length === 0) return null;
  return matched.sort(
    (a, b) => b.quantityAvailable - a.quantityAvailable,
  )[0]!;
}

/**
 * Re-check top catalog hits against live eBay GetItem stock
 * so we never say "oui dispo" from a stale CSV/cache.
 */
export async function verifyCatalogHitsLive(input: {
  hits: CatalogHit[];
  message: string;
  sellerUsername: string;
  maxVerify?: number;
  /** When verifying a specific Apple part, match that variation only. */
  applePart?: string;
}): Promise<CatalogHit[]> {
  const maxVerify = input.maxVerify ?? 3;
  const askedModel = extractAskedModelLabel(input.message);
  const askedIdentity = extractAskedIdentity(input.message);
  const applePart =
    input.applePart?.toUpperCase() ||
    extractApplePartNumbers(input.message)[0] ||
    undefined;
  const seller = await getSellerByUsername(input.sellerUsername);
  const verified: CatalogHit[] = [];

  for (const hit of input.hits.slice(0, maxVerify)) {
    const result = await getListingDetails(hit.itemId);
    if (!result.ok) {
      // API fail → drop hit rather than risk a false "oui"
      continue;
    }
    const listing = result.listing;
    const status = (listing.listingStatus ?? "").toLowerCase();
    const active = status === "active" || status === "";

    // The live title is the authority on what this listing actually is. A hit
    // that scored on shared words but names another model is dropped here — the
    // stock check below would otherwise confirm a product nobody asked for.
    if (!isEmptyIdentity(askedIdentity)) {
      const titleBlob = [listing.title ?? "", hit.title]
        .filter(Boolean)
        .join(" \n ");
      if (identityMatchesText(askedIdentity, titleBlob) === "mismatch") {
        continue;
      }
    }

    if (seller) {
      try {
        await upsertListingLiveFromDetails({
          sellerId: seller.id,
          listing,
          source: "getitem_live",
        });
      } catch {
        // DB update best-effort
      }
    }

    let quantityAvailable = active ? (listing.quantityAvailable ?? 0) : 0;
    let matchedVariationLabel = hit.matchedVariationLabel;
    let matchedVariationQty = hit.matchedVariationQty;

    if (applePart && listing.variations.length > 0) {
      const matched = matchVariationByApplePart(listing, applePart);
      if (matched) {
        matchedVariationLabel = matched.specifics
          .map((s) => s.value)
          .filter(Boolean)
          .join(" / ");
        matchedVariationQty = active ? matched.quantityAvailable : 0;
        quantityAvailable = matchedVariationQty;
      } else if (hit.matchedVariationLabel) {
        matchedVariationQty = 0;
        quantityAvailable = 0;
      }
    } else if (askedModel && listing.variations.length > 0) {
      const matched = matchListingVariation(input.message, listing);
      if (matched) {
        matchedVariationLabel = matched.specifics
          .map((s) => s.value)
          .filter(Boolean)
          .join(" / ");
        matchedVariationQty = active ? matched.quantityAvailable : 0;
        quantityAvailable = listing.variations.reduce(
          (s, v) => s + (active ? v.quantityAvailable : 0),
          0,
        );
      } else if (hit.matchedVariationLabel) {
        // Stale variation match no longer on listing
        matchedVariationQty = 0;
      }
    } else if (!active) {
      matchedVariationQty = 0;
    }

    // Prefer live title
    const liveHit: CatalogHit = {
      ...hit,
      title: listing.title ?? hit.title,
      quantityAvailable,
      matchedVariationLabel,
      matchedVariationQty,
      // Boost in-stock live hits
      score: hit.score + (quantityAvailable > 0 ? 5 : -5),
    };
    verified.push(liveHit);
  }

  // Keep remaining unverified hits only if we verified none (shouldn't happen often)
  if (verified.length === 0 && input.hits.length > 0) {
    return [];
  }

  return verified.sort((a, b) => b.score - a.score);
}
