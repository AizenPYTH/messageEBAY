import { config } from "../config.js";
import { allBlocks, allTagPairs, firstTag, stripHtml } from "./xml.js";

export type ListingVariation = {
  sku?: string;
  quantity: number;
  quantitySold: number;
  quantityAvailable: number;
  price?: string;
  specifics: Array<{ name: string; value: string }>;
};

export type ListingShippingOption = {
  service?: string;
  cost?: string;
  timeMin?: string;
  timeMax?: string;
  /** InternationalShippingServiceOption vs domestic ShippingServiceOptions. */
  international?: boolean;
};

export type ListingCompatibility = {
  specifics: Array<{ name: string; value: string }>;
  notes?: string;
};

export type ListingDetails = {
  itemId: string;
  title?: string;
  subtitle?: string;
  /** Listing-level SKU — sellers often put the service code here. */
  sku?: string;
  /** Buyers may send an offer on this listing. */
  bestOfferEnabled?: boolean;
  /** eBay parts compatibility list ("Compatible with…"). */
  compatibility: ListingCompatibility[];
  descriptionText?: string;
  categoryId?: string;
  categoryName?: string;
  condition?: string;
  conditionId?: string;
  price?: string;
  currency?: string;
  quantity?: string;
  quantitySold?: string;
  /** Remaining stock at listing level (Quantity - QuantitySold), when known. */
  quantityAvailable?: number;
  listingStatus?: string;
  /** eBay listing format: "Chinese" = auction, "FixedPriceItem" = buy it now. */
  listingType?: string;
  /** Bids received, for auctions. */
  bidCount?: number;
  /** Set when the auction also offers Buy It Now. */
  buyItNowPrice?: string;
  location?: string;
  itemSpecifics: Array<{ name: string; value: string }>;
  /** Multi-SKU / model / color variations with per-variant stock. */
  variations: ListingVariation[];
  shippingOptions: ListingShippingOption[];
  sellerUsername?: string;
  sellerFeedbackScore?: string;
  returnsAccepted?: string;
  returnsWithin?: string;
  shippingCostPaidBy?: string;
  dispatchTimeMax?: string;
  rawAvailable: true;
};

export type ListingLookupResult =
  | { ok: true; listing: ListingDetails }
  | { ok: false; reason: string };

function tradingEndpoint(): string {
  return config.env === "production"
    ? "https://api.ebay.com/ws/api.dll"
    : "https://api.sandbox.ebay.com/ws/api.dll";
}

function toInt(value: string | undefined): number | undefined {
  if (value === undefined || value === "") return undefined;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseVariations(variationsXml: string | undefined): ListingVariation[] {
  if (!variationsXml) return [];
  const out: ListingVariation[] = [];
  for (const block of allBlocks(variationsXml, "Variation")) {
    const qty = toInt(firstTag(block, "Quantity")) ?? 0;
    const sold =
      toInt(firstTag(firstTag(block, "SellingStatus") ?? block, "QuantitySold")) ??
      toInt(firstTag(block, "QuantitySold")) ??
      0;
    const available = Math.max(0, qty - sold);
    const specificsBlock =
      firstTag(block, "VariationSpecifics") ?? block;
    const specifics = allTagPairs(specificsBlock, "Name", "Value");
    out.push({
      sku: firstTag(block, "SKU"),
      quantity: qty,
      quantitySold: sold,
      quantityAvailable: available,
      price: firstTag(block, "StartPrice") ?? firstTag(block, "CurrentPrice"),
      specifics,
    });
  }
  return out;
}

function parseShippingOptions(itemXml: string): ListingShippingOption[] {
  const details = firstTag(itemXml, "ShippingDetails");
  if (!details) return [];
  const options: ListingShippingOption[] = [];
  for (const block of allBlocks(details, "ShippingServiceOptions")) {
    options.push({
      service: firstTag(block, "ShippingService"),
      cost: firstTag(block, "ShippingServiceCost"),
      timeMin: firstTag(block, "ShippingTimeMin"),
      timeMax: firstTag(block, "ShippingTimeMax"),
      international: false,
    });
  }
  for (const block of allBlocks(details, "InternationalShippingServiceOption")) {
    options.push({
      service: firstTag(block, "ShippingService"),
      cost: firstTag(block, "ShippingServiceCost"),
      timeMin: firstTag(block, "ShippingTimeMin"),
      timeMax: firstTag(block, "ShippingTimeMax"),
      international: true,
    });
  }
  return options.slice(0, 8);
}

/** <ItemCompatibilityList> — "Compatible with: Marque X, Modèle Y". */
function parseCompatibility(itemXml: string): ListingCompatibility[] {
  const list = firstTag(itemXml, "ItemCompatibilityList");
  if (!list) return [];
  const out: ListingCompatibility[] = [];
  for (const block of allBlocks(list, "Compatibility")) {
    const specifics = allTagPairs(block, "Name", "Value");
    const notes = firstTag(block, "CompatibilityNotes");
    if (specifics.length === 0 && !notes) continue;
    out.push({ specifics, ...(notes ? { notes } : {}) });
  }
  return out.slice(0, 200);
}

function sellingStatusEarly(itemXml: string): string {
  return firstTag(itemXml, "SellingStatus") ?? itemXml;
}

/** Exported for tests — parse GetItem success XML into ListingDetails. */
export function parseGetItemListing(xml: string, itemId: string): ListingDetails {
  const itemXml = firstTag(xml, "Item") ?? xml;
  const descriptionXml = firstTag(itemXml, "Description");
  const descriptionText = descriptionXml
    ? stripHtml(descriptionXml)
    : undefined;

  const price =
    firstTag(itemXml, "CurrentPrice") ||
    firstTag(itemXml, "StartPrice") ||
    firstTag(itemXml, "BuyItNowPrice");
  const listingType =
    firstTag(firstTag(itemXml, "ListingDetails") ?? "", "ListingType") ||
    firstTag(itemXml, "ListingType");
  const bidCount = toInt(firstTag(sellingStatusEarly(itemXml), "BidCount"));
  const buyItNowPrice = firstTag(itemXml, "BuyItNowPrice");

  const quantity = firstTag(itemXml, "Quantity");
  const sellingStatus = firstTag(itemXml, "SellingStatus");
  const quantitySold =
    firstTag(sellingStatus ?? "", "QuantitySold") ||
    firstTag(itemXml, "QuantitySold");
  const qtyN = toInt(quantity);
  const soldN = toInt(quantitySold) ?? 0;
  const quantityAvailable =
    qtyN !== undefined ? Math.max(0, qtyN - soldN) : undefined;

  const itemSpecificsXml = firstTag(itemXml, "ItemSpecifics");
  const itemSpecifics = itemSpecificsXml
    ? allTagPairs(itemSpecificsXml, "Name", "Value")
    : allTagPairs(itemXml, "Name", "Value").slice(0, 40);

  const variations = parseVariations(firstTag(itemXml, "Variations"));
  const compatibility = parseCompatibility(itemXml);
  const bestOffer = firstTag(
    firstTag(itemXml, "ListingDetails") ?? itemXml,
    "BestOfferEnabled",
  );
  // If variations exist, listing-level available = sum of in-stock variants.
  const variationAvailable = variations.length
    ? variations.reduce((sum, v) => sum + v.quantityAvailable, 0)
    : undefined;

  return {
    itemId: firstTag(itemXml, "ItemID") || itemId,
    title: firstTag(itemXml, "Title"),
    subtitle: firstTag(itemXml, "SubTitle"),
    sku: firstTag(itemXml, "SKU"),
    ...(bestOffer ? { bestOfferEnabled: bestOffer.toLowerCase() === "true" } : {}),
    compatibility,
    descriptionText,
    categoryId: firstTag(itemXml, "CategoryID"),
    categoryName: firstTag(itemXml, "CategoryName"),
    condition: firstTag(itemXml, "ConditionDisplayName"),
    conditionId: firstTag(itemXml, "ConditionID"),
    price,
    ...(listingType ? { listingType } : {}),
    ...(bidCount !== undefined ? { bidCount } : {}),
    ...(buyItNowPrice ? { buyItNowPrice } : {}),
    currency: firstTag(itemXml, "Currency"),
    quantity,
    quantitySold,
    quantityAvailable: variationAvailable ?? quantityAvailable,
    listingStatus: firstTag(itemXml, "ListingStatus"),
    location: firstTag(itemXml, "Location"),
    itemSpecifics,
    variations,
    shippingOptions: parseShippingOptions(itemXml),
    sellerUsername: firstTag(itemXml, "UserID"),
    sellerFeedbackScore: firstTag(itemXml, "FeedbackScore"),
    returnsAccepted: firstTag(itemXml, "ReturnsAcceptedOption"),
    returnsWithin: firstTag(itemXml, "ReturnsWithinOption"),
    shippingCostPaidBy: firstTag(itemXml, "ShippingCostPaidByOption"),
    dispatchTimeMax: firstTag(itemXml, "DispatchTimeMax"),
    rawAvailable: true,
  };
}

export async function getListingDetails(
  itemId: string,
  siteId = "71",
): Promise<ListingLookupResult> {
  if (!config.accessToken) {
    return { ok: false, reason: "EBAY_USER_ACCESS_TOKEN manquant" };
  }

  const body = `<?xml version="1.0" encoding="utf-8"?>
<GetItemRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <ItemID>${itemId}</ItemID>
  <IncludeItemSpecifics>true</IncludeItemSpecifics>
  <DetailLevel>ReturnAll</DetailLevel>
</GetItemRequest>`;

  const response = await fetch(tradingEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-CALL-NAME": "GetItem",
      "X-EBAY-API-SITEID": siteId,
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1271",
      "X-EBAY-API-IAF-TOKEN": config.accessToken,
    },
    body,
  });

  const xml = await response.text();
  const ack = firstTag(xml, "Ack");
  if (!response.ok || (ack !== "Success" && ack !== "Warning")) {
    const shortMsg = firstTag(xml, "ShortMessage");
    const longMsg = firstTag(xml, "LongMessage");
    return {
      ok: false,
      reason: longMsg || shortMsg || `GetItem failed (HTTP ${response.status})`,
    };
  }

  return { ok: true, listing: parseGetItemListing(xml, itemId) };
}
