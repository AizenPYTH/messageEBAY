import { config } from "../config.js";
import { allTagPairs, firstTag, stripHtml } from "./xml.js";

export type ListingDetails = {
  itemId: string;
  title?: string;
  descriptionText?: string;
  categoryId?: string;
  categoryName?: string;
  condition?: string;
  conditionId?: string;
  price?: string;
  currency?: string;
  quantity?: string;
  quantitySold?: string;
  listingStatus?: string;
  location?: string;
  itemSpecifics: Array<{ name: string; value: string }>;
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
  if (!response.ok || ack !== "Success") {
    const shortMsg = firstTag(xml, "ShortMessage");
    const longMsg = firstTag(xml, "LongMessage");
    return {
      ok: false,
      reason: longMsg || shortMsg || `GetItem failed (HTTP ${response.status})`,
    };
  }

  const descriptionXml = firstTag(xml, "Description");
  const descriptionText = descriptionXml
    ? stripHtml(descriptionXml)
    : undefined;

  const price =
    firstTag(xml, "CurrentPrice") ||
    firstTag(xml, "StartPrice") ||
    firstTag(xml, "BuyItNowPrice");

  const listing: ListingDetails = {
    itemId: firstTag(xml, "ItemID") || itemId,
    title: firstTag(xml, "Title"),
    descriptionText,
    categoryId: firstTag(xml, "CategoryID"),
    categoryName: firstTag(xml, "CategoryName"),
    condition: firstTag(xml, "ConditionDisplayName"),
    conditionId: firstTag(xml, "ConditionID"),
    price,
    currency: firstTag(xml, "Currency"),
    quantity: firstTag(xml, "Quantity"),
    quantitySold: firstTag(xml, "QuantitySold"),
    listingStatus: firstTag(xml, "ListingStatus"),
    location: firstTag(xml, "Location"),
    itemSpecifics: allTagPairs(xml, "Name", "Value"),
    sellerUsername: firstTag(xml, "UserID"),
    sellerFeedbackScore: firstTag(xml, "FeedbackScore"),
    returnsAccepted: firstTag(xml, "ReturnsAcceptedOption"),
    returnsWithin: firstTag(xml, "ReturnsWithinOption"),
    shippingCostPaidBy: firstTag(xml, "ShippingCostPaidByOption"),
    dispatchTimeMax: firstTag(xml, "DispatchTimeMax"),
    rawAvailable: true,
  };

  return { ok: true, listing };
}
