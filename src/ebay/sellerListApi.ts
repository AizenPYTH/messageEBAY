import { config } from "../config.js";
import { allBlocks, firstTag } from "./xml.js";
import {
  parseGetItemListing,
  type ListingDetails,
} from "./tradingApi.js";

export type SellerListPage = {
  listings: ListingDetails[];
  pageNumber: number;
  totalPages: number;
  totalEntries: number;
};

function tradingEndpoint(): string {
  return config.env === "production"
    ? "https://api.ebay.com/ws/api.dll"
    : "https://api.sandbox.ebay.com/ws/api.dll";
}

function isoDaysFromNow(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

/**
 * Active listings page via Trading GetSellerList.
 * EndTime window covers currently active fixed-price listings.
 */
export async function getSellerListPage(input?: {
  pageNumber?: number;
  entriesPerPage?: number;
  siteId?: string;
}): Promise<{ ok: true; page: SellerListPage } | { ok: false; reason: string }> {
  if (!config.accessToken) {
    return { ok: false, reason: "EBAY_USER_ACCESS_TOKEN manquant" };
  }

  const pageNumber = input?.pageNumber ?? 1;
  const entriesPerPage = input?.entriesPerPage ?? 200;
  const siteId = input?.siteId ?? "71";

  const body = `<?xml version="1.0" encoding="utf-8"?>
<GetSellerListRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <WarningLevel>High</WarningLevel>
  <IncludeVariations>true</IncludeVariations>
  <DetailLevel>ReturnAll</DetailLevel>
  <Pagination>
    <EntriesPerPage>${entriesPerPage}</EntriesPerPage>
    <PageNumber>${pageNumber}</PageNumber>
  </Pagination>
  <EndTimeFrom>${isoDaysFromNow(-1)}</EndTimeFrom>
  <EndTimeTo>${isoDaysFromNow(120)}</EndTimeTo>
  <Sort>1</Sort>
</GetSellerListRequest>`;

  const response = await fetch(tradingEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-CALL-NAME": "GetSellerList",
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
      reason: longMsg || shortMsg || `GetSellerList failed (HTTP ${response.status})`,
    };
  }

  const pagination = firstTag(xml, "PaginationResult") ?? "";
  const totalPages = Number(firstTag(pagination, "TotalNumberOfPages") ?? "1") || 1;
  const totalEntries =
    Number(firstTag(pagination, "TotalNumberOfEntries") ?? "0") || 0;

  const listings: ListingDetails[] = [];
  for (const itemXml of allBlocks(xml, "Item")) {
    const itemId = firstTag(itemXml, "ItemID");
    if (!itemId) continue;
    listings.push(parseGetItemListing(`<Item>${itemXml}</Item>`, itemId));
  }

  return {
    ok: true,
    page: {
      listings,
      pageNumber,
      totalPages,
      totalEntries,
    },
  };
}
