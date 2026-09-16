/**
 * eBay Browse API — the public marketplace catalogue.
 *
 * Used to find out what a service code actually is, by looking at how the whole
 * marketplace titles it. It reads public listings with an application token, so
 * it never touches the seller's own account, and it is never consulted to
 * answer a stock question: our own catalogue is the only authority on that.
 */

import { config } from "../config.js";
import { getApplicationToken } from "./oauth.js";

export type BrowseItemSummary = {
  itemId?: string;
  title?: string;
  condition?: string;
  categoryPath?: string;
  price?: string;
  currency?: string;
};

function browseBase(): string {
  return config.env === "production"
    ? "https://api.ebay.com/buy/browse/v1"
    : "https://api.sandbox.ebay.com/buy/browse/v1";
}

/** eBay marketplace id — FR by default, matching the seller's site. */
function marketplaceId(): string {
  return process.env.EBAY_MARKETPLACE_ID?.trim() || "EBAY_FR";
}

export type BrowseSearchResult =
  | { ok: true; items: BrowseItemSummary[] }
  | { ok: false; reason: string };

export async function searchMarketplace(input: {
  query: string;
  limit?: number;
  timeoutMs?: number;
}): Promise<BrowseSearchResult> {
  const query = input.query.trim();
  if (!query) return { ok: false, reason: "requête vide" };

  let token: string;
  try {
    token = await getApplicationToken();
  } catch (error: unknown) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : "token application eBay",
    };
  }

  const url = new URL(`${browseBase()}/item_summary/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(Math.min(50, input.limit ?? 20)));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? 8000);
  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "X-EBAY-C-MARKETPLACE-ID": marketplaceId(),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { ok: false, reason: `Browse HTTP ${response.status}` };
    }
    const data = (await response.json()) as {
      itemSummaries?: Array<{
        itemId?: string;
        title?: string;
        condition?: string;
        categories?: Array<{ categoryName?: string }>;
        price?: { value?: string; currency?: string };
      }>;
    };
    const items = (data.itemSummaries ?? []).map((raw) => ({
      ...(raw.itemId ? { itemId: raw.itemId } : {}),
      ...(raw.title ? { title: raw.title } : {}),
      ...(raw.condition ? { condition: raw.condition } : {}),
      ...(raw.categories?.[0]?.categoryName
        ? { categoryPath: raw.categories[0].categoryName }
        : {}),
      ...(raw.price?.value ? { price: raw.price.value } : {}),
      ...(raw.price?.currency ? { currency: raw.price.currency } : {}),
    }));
    return { ok: true, items };
  } catch (error: unknown) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      reason: aborted ? "Browse timeout" : "Browse indisponible",
    };
  } finally {
    clearTimeout(timer);
  }
}
