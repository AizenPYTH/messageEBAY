import { getSellerByUsername } from "../database/repositories/sellers.js";
import { searchCatalogListings } from "../database/repositories/listings.js";
import { listVariationsForListingIds } from "../database/repositories/listingVariations.js";
import type { ListingRow, ListingVariationRow } from "../database/types.js";
import type { ListingDetails } from "../ebay/tradingApi.js";
import { getListingDetails } from "../ebay/tradingApi.js";
import {
  extractApplePartNumbers,
  messageAsksScreen,
  titleIsMultiAppleModel,
  titleLooksLikeScreen,
  variationMentionsApplePart,
  extractAskedFinish,
  listingFinish,
  askedFinishDiffersFromListing,
} from "./appleParts.js";
import type { CatalogHit } from "./searchCatalog.js";
import { verifyCatalogHitsLive } from "./verifyLive.js";
import type { ListingAnswerability } from "../analysis/types.js";

export type PartStockResult = {
  part: string;
  available: boolean;
  quantity: number;
  hit?: CatalogHit;
  askedLabel?: string;
  /** No Grade A in that colour — offer this Grade B at the Grade A price. */
  samePriceDowngrade?: boolean;
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function variationHasPart(
  v: {
    sku?: string | null;
    specifics?: Array<{ name: string; value: string }> | null;
  },
  part: string,
): boolean {
  return variationMentionsApplePart(v, part);
}

function listingMentionsPart(listing: ListingDetails, part: string): boolean {
  const p = part.toLowerCase();
  const titleHay = normalize(`${listing.title ?? ""}`);
  if (titleHay.includes(p)) return true;
  return (listing.variations ?? []).some((v) => variationHasPart(v, part));
}

function qtyForPartOnListing(listing: ListingDetails, part: string): number {
  const vars = listing.variations ?? [];
  const matched = vars.filter((v) => variationHasPart(v, part));
  if (matched.length > 0) {
    return matched.reduce((sum, v) => sum + (v.quantityAvailable ?? 0), 0);
  }
  // Dedicated single-model listing (part in title, no matching variation row)
  const multi = titleIsMultiAppleModel(listing.title ?? "");
  if (!multi && normalize(listing.title ?? "").includes(part.toLowerCase())) {
    return listing.quantityAvailable ?? 0;
  }
  // Multi-model title, part named but no variation row → treat as OOS
  if (multi && normalize(listing.title ?? "").includes(part.toLowerCase())) {
    return 0;
  }
  return 0;
}

function hitFromListing(
  listing: ListingDetails,
  part: string,
  qty: number,
): CatalogHit {
  return {
    itemId: listing.itemId,
    title: listing.title ?? "",
    quantityAvailable: qty,
    itemUrl: `https://www.ebay.fr/itm/${listing.itemId}`,
    matchedVariationLabel: part,
    matchedVariationQty: qty,
    score: qty > 0 ? 100 : 0,
  };
}

/**
 * Pure stock check for an Apple part on a listing (no network).
 * Returns null if the part is not mentioned on this listing.
 */
export function evaluatePartOnListing(
  listing: ListingDetails,
  part: string,
): PartStockResult | null {
  if (!listingMentionsPart(listing, part)) return null;
  const qty = qtyForPartOnListing(listing, part);
  return {
    part,
    available: qty > 0,
    quantity: qty,
    hit: qty > 0 ? hitFromListing(listing, part, qty) : undefined,
  };
}

/**
 * If the conversation listing covers this Apple part (title/variations),
 * answer ONLY from that listing — never from another Axxxx elsewhere.
 * Returns null when the part is not on this listing (caller may search catalog).
 */
async function resolvePartOnCurrentListing(input: {
  listing: ListingDetails;
  part: string;
  message: string;
}): Promise<PartStockResult | null> {
  if (!listingMentionsPart(input.listing, input.part)) {
    return null;
  }
  if (askedFinishDiffersFromListing(input.message, input.listing.title)) {
    return null;
  }

  let live = input.listing;
  const refreshed = await getListingDetails(input.listing.itemId);
  if (refreshed.ok) {
    live = refreshed.listing;
  }

  return evaluatePartOnListing(live, input.part);
}

function finishScoreDelta(title: string, asked: ReturnType<typeof extractAskedFinish>): number {
  const have = listingFinish(title);
  let s = 0;
  if (asked.color) {
    if (have.color === asked.color) s += 18;
    else if (have.color) s -= 22;
  }
  if (asked.grade) {
    if (have.grade === asked.grade) s += 8;
    else if (have.grade) s -= 5;
  }
  return s;
}
function scorePartHit(
  row: ListingRow,
  variations: ListingVariationRow[],
  part: string,
  preferScreen: boolean,
  asked = extractAskedFinish(""),
): CatalogHit | null {
  const title = row.title ?? "";
  const hay = normalize(`${title} ${row.search_text ?? ""}`);
  const partNorm = part.toLowerCase();
  if (!hay.includes(partNorm)) return null;

  const multi = titleIsMultiAppleModel(title);
  const matchedVars = variations.filter((v) => variationHasPart(v, part));
  const finish = finishScoreDelta(title, asked);

  // Multi-model listing without a matching in-stock variation → cannot say yes.
  if (multi && variations.length === 0) {
    return null;
  }
  if (multi && matchedVars.length > 0) {
    const best = matchedVars.sort(
      (a, b) => b.quantity_available - a.quantity_available,
    )[0]!;
    if (best.quantity_available <= 0) return null;
    return {
      itemId: row.item_id,
      title,
      quantityAvailable: best.quantity_available,
      itemUrl: row.item_url ?? `https://www.ebay.fr/itm/${row.item_id}`,
      matchedVariationLabel: part,
      matchedVariationQty: best.quantity_available,
      score: 20 + best.quantity_available + finish,
    };
  }
  if (multi) return null;

  // Dedicated listing (1–2 models in title)
  let score = 10 + finish;
  if (preferScreen && titleLooksLikeScreen(title)) score += 8;
  if (preferScreen && !titleLooksLikeScreen(title)) score -= 4;
  const qty = row.quantity_available ?? 0;
  if (qty <= 0) {
    return {
      itemId: row.item_id,
      title,
      quantityAvailable: 0,
      itemUrl: row.item_url ?? `https://www.ebay.fr/itm/${row.item_id}`,
      score: score - 5,
    };
  }
  score += Math.min(qty, 10);
  return {
    itemId: row.item_id,
    title,
    quantityAvailable: qty,
    itemUrl: row.item_url ?? `https://www.ebay.fr/itm/${row.item_id}`,
    score,
  };
}

function askedPartLabel(part: string, message: string): string {
  const f = extractAskedFinish(message);
  const bits = [part];
  if (f.grade) bits.push(`Grade ${f.grade.toUpperCase()}`);
  if (f.color === "gris") bits.push("gris sidéral");
  if (f.color === "argent") bits.push("argenté");
  return bits.join(" ");
}

function pickStockHit(
  inStock: CatalogHit[],
  message: string,
): { hit: CatalogHit; samePriceDowngrade: boolean } | null {
  if (inStock.length === 0) return null;
  const asked = extractAskedFinish(message);
  const ranked = [...inStock].sort((a, b) => b.score - a.score);
  if (!asked.color && !asked.grade) {
    return { hit: ranked[0]!, samePriceDowngrade: false };
  }
  const sameColor = asked.color
    ? ranked.filter((h) => listingFinish(h.title).color === asked.color)
    : ranked;
  if (asked.color && sameColor.length === 0) return null;
  const exact = sameColor.filter((h) => {
    const g = listingFinish(h.title).grade;
    if (asked.grade && g && g !== asked.grade) return false;
    return true;
  });
  if (exact.length > 0) {
    return { hit: exact[0]!, samePriceDowngrade: false };
  }
  const gradeB = sameColor.filter((h) => listingFinish(h.title).grade === "b");
  if (asked.grade === "a" && gradeB.length > 0) {
    return { hit: gradeB[0]!, samePriceDowngrade: true };
  }
  return { hit: sameColor[0]!, samePriceDowngrade: false };
}
async function findBestHitForPart(input: {
  sellerId: string;
  part: string;
  message: string;
  sellerUsername: string;
  excludeItemId?: string;
}): Promise<{ hit: CatalogHit; samePriceDowngrade: boolean } | null> {
  const preferScreen = messageAsksScreen(input.message);
  const asked = extractAskedFinish(input.message);
  const tokens = preferScreen
    ? [input.part.toLowerCase(), "ecran", "lcd"]
    : [input.part.toLowerCase()];

  const rows = await searchCatalogListings({
    sellerId: input.sellerId,
    tokens,
    excludeItemId: input.excludeItemId,
    limit: 40,
  });

  const variations = await listVariationsForListingIds(rows.map((r) => r.id));
  const byListing = new Map<string, ListingVariationRow[]>();
  for (const v of variations) {
    const list = byListing.get(v.listing_id) ?? [];
    list.push(v);
    byListing.set(v.listing_id, list);
  }

  const scored: CatalogHit[] = [];
  for (const row of rows) {
    const hit = scorePartHit(
      row,
      byListing.get(row.id) ?? [],
      input.part,
      preferScreen,
      asked,
    );
    if (hit) scored.push(hit);
  }
  scored.sort((a, b) => b.score - a.score);
  if (scored.length === 0) return null;

  const take = asked.color || asked.grade ? 8 : 3;
  const live = await verifyCatalogHitsLive({
    hits: scored.slice(0, take),
    message: input.part,
    sellerUsername: input.sellerUsername,
    maxVerify: take,
    applePart: input.part,
  });

  const inStock = live.filter((h) => {
    if (typeof h.matchedVariationQty === "number") {
      return h.matchedVariationQty > 0;
    }
    return h.quantityAvailable > 0;
  });
  const picked = pickStockHit(inStock, input.message);
  if (picked) return picked;
  const oos = live[0] ?? scored[0];
  if (!oos) return null;
  return {
    hit: { ...oos, quantityAvailable: 0, matchedVariationQty: 0 },
    samePriceDowngrade: false,
  };
}

export async function resolveApplePartsStock(input: {
  sellerUsername: string;
  message: string;
  excludeItemId?: string;
  /** Conversation listing — preferred source when it covers the asked part. */
  currentListing?: ListingDetails;
}): Promise<PartStockResult[]> {
  const parts = extractApplePartNumbers(input.message);
  if (parts.length === 0) return [];

  const seller = await getSellerByUsername(input.sellerUsername);
  if (!seller) return [];

  const results: PartStockResult[] = [];
  for (const part of parts) {
    // 1) Part on the conversation listing → answer only from that listing.
    if (input.currentListing) {
      const onCurrent = await resolvePartOnCurrentListing({
        listing: input.currentListing,
        part,
        message: input.message,
      });
      if (onCurrent) {
        results.push(onCurrent);
        continue;
      }
    }

    // 2) Part not on current listing → search dedicated catalog listings.
    const found = await findBestHitForPart({
      sellerId: seller.id,
      part,
      message: input.message,
      sellerUsername: input.sellerUsername,
      excludeItemId: input.excludeItemId,
    });
    const label = askedPartLabel(part, input.message);
    if (!found) {
      results.push({ part, available: false, quantity: 0, askedLabel: label });
      continue;
    }
    const qty =
      typeof found.hit.matchedVariationQty === "number"
        ? found.hit.matchedVariationQty
        : found.hit.quantityAvailable;
    results.push({
      part,
      available: qty > 0,
      quantity: qty,
      hit: qty > 0 ? found.hit : undefined,
      askedLabel: label,
      samePriceDowngrade: Boolean(found.samePriceDowngrade && qty > 0),
    });
  }
  return results;
}

export function buildApplePartsReply(input: {
  parts: PartStockResult[];
  shippingText?: string | null;
  languageCode?: string;
  signature?: string;
  /** If the hit is this conversation listing, do not paste a redundant URL. */
  currentItemId?: string;
}): { reply: string; answerability: ListingAnswerability; signals: string[] } {
  const signals = input.parts.map(
    (p) => `${p.part}=${p.available ? `yes:${p.quantity}` : "no"}`,
  );
  const ship = input.shippingText?.trim().replace(/\.$/, "") || null;
  const bits: string[] = [];
  const currentId = input.currentItemId?.trim();

  for (const p of input.parts) {
    const label = p.askedLabel || p.part;
    if (p.samePriceDowngrade && p.available && p.hit) {
      bits.push(
        `Plus de Grade A en ${extractAskedFinish(label).color === "gris" ? "gris sidéral" : "cette couleur"} au même tarif. J'ai un Grade B plutôt propre, je peux vous le faire au même prix : ${p.hit.itemUrl}`,
      );
      continue;
    }
    if (p.available && p.hit) {
      const sameListing = Boolean(currentId && p.hit.itemId === currentId);
      bits.push(
        input.parts.length === 1
          ? sameListing
            ? `Oui le ${label} est tjr dispo.`
            : `Oui le ${label} est tjr dispo, voici le lien : ${p.hit.itemUrl}`
          : sameListing
            ? `${label} oui dispo`
            : `${label} oui dispo, voici le lien : ${p.hit.itemUrl}`,
      );
    } else {
      bits.push(
        input.parts.length === 1
          ? `Non, malheureusement le ${label} n'est plus en stock`
          : `${label} plus en stock malheureusement`,
      );
    }
  }

  const body = ship ? `${bits.join(". ")}. ${ship}.` : `${bits.join(". ")}.`;
  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  const reply =
    input.languageCode === "en"
      ? `Hi,\n\n${body}\n\n${sig}`
      : `Bonjour,\n\n${body}\n\n${sig}`;

  const anyYes = input.parts.some((p) => p.available);
  const anyNo = input.parts.some((p) => !p.available);
  const answerability: ListingAnswerability =
    anyYes && !anyNo
      ? "direct_yes"
      : !anyYes && anyNo
        ? "direct_no"
        : anyYes
          ? "direct_yes"
          : "direct_no";

  return { reply, answerability, signals };
}
