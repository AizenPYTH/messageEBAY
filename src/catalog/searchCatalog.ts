import { getSellerByUsername } from "../database/repositories/sellers.js";
import { searchCatalogListings } from "../database/repositories/listings.js";
import { listVariationsForListingIds } from "../database/repositories/listingVariations.js";
import {
  extractAskedModelLabel,
} from "../analysis/listingEvidence.js";
import {
  canAssertSameProduct,
  extractAskedIdentity,
  isEmptyIdentity,
  isGenericPartWord,
  type ProductIdentity,
} from "../product/identity.js";
import type { ListingRow, ListingVariationRow } from "../database/types.js";
import { verifyCatalogHitsLive } from "./verifyLive.js";

export type CatalogHit = {
  itemId: string;
  title: string;
  /** Everything the listing says it is — title, specifics, SKUs. */
  matchText?: string;
  quantityAvailable: number;
  itemUrl: string;
  matchedVariationLabel?: string;
  matchedVariationQty?: number;
  score: number;
};

const STOP = new Set([
  "bonjour",
  "hello",
  "salut",
  "merci",
  "svp",
  "please",
  "avez",
  "vous",
  "avec",
  "pour",
  "dans",
  "une",
  "des",
  "les",
  "est",
  "dispo",
  "disponible",
  "stock",
  "temps",
  "livraison",
  "envoi",
  "envoyer",
  "envoye",
  "expedition",
  "delai",
  "jour",
  "jours",
  "meme",
  "meem",
  "rapide",
  "quand",
  "quel",
  "quelle",
  "quoi",
  "comment",
  "encore",
  "toujours",
  "aussi",
  "etre",
  "que",
  "qui",
  "ces",
  "cet",
  "cette",
]);

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Phrase after "avez-vous / tu as …" → other-product ask. */
export function extractAskedProductPhrase(message: string): string | null {
  const m = message.match(
    /\b(?:avez[- ]vous|vous\s+avez|as[- ]tu|tu\s+as|y\s+a[- ]t[- ]il)\s+(?:encore\s+|toujours\s+)?(?:des?\s+|du\s+|de\s+la\s+|d['’]\s*)?([^?.;,\n]{3,60})/i,
  );
  if (!m?.[1]) return null;
  const phrase = m[1].replace(/\b(dispo|disponible|en\s+stock)\b/gi, "").trim();
  return phrase.length >= 3 ? phrase : null;
}

/**
 * A token that actually identifies a product. "ecran" matches every screen in
 * the shop, so it can never be the reason a listing is proposed to a buyer.
 */
export function isDistinctiveToken(token: string): boolean {
  if (token.length < 3) return false;
  if (STOP.has(token)) return false;
  return !isGenericPartWord(token);
}

export function extractCatalogSearchTokens(message: string): string[] {
  const tokens: string[] = [];
  const model = extractAskedModelLabel(message);
  if (model) {
    tokens.push(...normalize(model).split(" ").filter(Boolean));
  }
  const product = extractAskedProductPhrase(message);
  if (product) {
    for (const w of normalize(product).split(" ")) {
      if (w.length < 3 || STOP.has(w)) continue;
      if (!tokens.includes(w)) tokens.push(w);
    }
  }
  for (const w of normalize(message).split(" ")) {
    if (w.length < 3 || STOP.has(w)) continue;
    if (/^\d+$/.test(w) && w.length < 2) continue;
    if (!tokens.includes(w)) tokens.push(w);
  }
  // The SQL filter only keeps the first few tokens — spend them on the ones
  // that identify the product, not on "ecran" / "complet" / "noir".
  return [
    ...tokens.filter((t) => isDistinctiveToken(t)),
    ...tokens.filter((t) => !isDistinctiveToken(t)),
  ].slice(0, 8);
}

function variationLabel(v: ListingVariationRow): string {
  const specs = (v.specifics ?? []).map((s) => s.value).filter(Boolean);
  return specs.join(" / ") || v.sku || "variante";
}

function variationMatchesModel(
  v: ListingVariationRow,
  askedModel: string | null,
): boolean {
  if (!askedModel) return false;
  const asked = normalize(askedModel);
  const hay = normalize(
    `${variationLabel(v)} ${(v.specifics ?? []).map((s) => `${s.name} ${s.value}`).join(" ")}`,
  );
  if (hay.includes(asked)) return true;
  // "Surface Pro 8" vs "PRO 8"
  const num = askedModel.match(/(\d+)/)?.[1];
  if (num && (hay.includes(`pro ${num}`) || hay.endsWith(` ${num}`) || hay === `pro ${num}`)) {
    return true;
  }
  // CSV uses MODEL=PRO 8
  if (num && /\bpro\b/.test(asked) && (hay === `pro ${num}` || hay.includes(`pro ${num}`))) {
    return true;
  }
  return false;
}

function scoreHit(input: {
  row: ListingRow;
  variations: ListingVariationRow[];
  tokens: string[];
  askedModel: string | null;
  askedIdentity: ProductIdentity | null;
}): CatalogHit | null {
  const rowText = `${input.row.title ?? ""} ${input.row.search_text ?? ""}`;
  const hay = normalize(rowText);

  // Hard gate: a listing we cannot show is the asked product is never proposed.
  // A coded question needs the code, not merely the absence of a contradiction.
  if (!isEmptyIdentity(input.askedIdentity)) {
    if (!canAssertSameProduct(input.askedIdentity, rowText)) return null;
  }

  // At least one token must identify the product. Without this, every screen in
  // the shop scores on "ecran" alone and the top one gets sent as an answer.
  const distinctive = input.tokens.filter((t) => isDistinctiveToken(t));
  if (distinctive.length > 0 && !distinctive.some((t) => hay.includes(t))) {
    return null;
  }

  let score = 0;
  for (const token of input.tokens) {
    if (!hay.includes(token)) continue;
    if (!isDistinctiveToken(token)) continue;
    score += token.length >= 4 ? 3 : 1;
  }

  let matchedVariationLabel: string | undefined;
  let matchedVariationQty: number | undefined;

  if (input.askedModel) {
    const matches = input.variations.filter((v) =>
      variationMatchesModel(v, input.askedModel),
    );
    if (matches.length === 0 && input.variations.length > 0) {
      // Title mentions model family but this listing's variations don't include it.
      if (!hay.includes(normalize(input.askedModel).split(" ").pop() ?? "___")) {
        return null;
      }
      // Multi-model title without matching variation → weak / skip unless title exact
      score -= 5;
    } else if (matches.length > 0) {
      const best = matches.sort(
        (a, b) => b.quantity_available - a.quantity_available,
      )[0]!;
      matchedVariationLabel = variationLabel(best);
      matchedVariationQty = best.quantity_available;
      score += best.quantity_available > 0 ? 12 : 4;
    }
  }

  if ((input.row.quantity_available ?? 0) > 0) score += 2;
  if (score <= 0) return null;

  return {
    itemId: input.row.item_id,
    title: input.row.title ?? input.row.item_id,
    matchText: rowText,
    quantityAvailable: input.row.quantity_available ?? 0,
    itemUrl:
      input.row.item_url ?? `https://www.ebay.fr/itm/${input.row.item_id}`,
    matchedVariationLabel,
    matchedVariationQty,
    score,
  };
}

export async function searchSellerCatalog(input: {
  sellerUsername: string;
  message: string;
  excludeItemId?: string;
  limit?: number;
}): Promise<CatalogHit[]> {
  const seller = await getSellerByUsername(input.sellerUsername);
  if (!seller) return [];

  const tokens = extractCatalogSearchTokens(input.message);
  if (tokens.length === 0) return [];

  const askedModel = extractAskedModelLabel(input.message);
  const askedIdentity = extractAskedIdentity(input.message);
  const rows = await searchCatalogListings({
    sellerId: seller.id,
    tokens,
    excludeItemId: input.excludeItemId,
    limit: input.limit ?? 20,
  });

  const variations = await listVariationsForListingIds(rows.map((r) => r.id));
  const byListing = new Map<string, ListingVariationRow[]>();
  for (const v of variations) {
    const list = byListing.get(v.listing_id) ?? [];
    list.push(v);
    byListing.set(v.listing_id, list);
  }

  const hits: CatalogHit[] = [];
  for (const row of rows) {
    const hit = scoreHit({
      row,
      variations: byListing.get(row.id) ?? [],
      tokens,
      askedModel,
      askedIdentity,
    });
    if (hit) hits.push(hit);
  }

  return hits.sort((a, b) => b.score - a.score).slice(0, input.limit ?? 5);
}

/**
 * Catalog search + live eBay GetItem verify on top hits.
 * Use this for buyer-facing answers (never trust CSV alone for "oui").
 */
export async function searchSellerCatalogLive(input: {
  sellerUsername: string;
  message: string;
  excludeItemId?: string;
  limit?: number;
}): Promise<CatalogHit[]> {
  const hits = await searchSellerCatalog(input);
  if (hits.length === 0) return [];
  return verifyCatalogHitsLive({
    hits,
    message: input.message,
    sellerUsername: input.sellerUsername,
    maxVerify: Math.min(3, input.limit ?? 5),
  });
}
