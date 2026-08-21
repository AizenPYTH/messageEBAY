/**
 * eBay Message API often omits referenceId LISTING (old threads, first-50
 * list only, order-linked convos). Recover an item ID from other signals.
 */

const ITEM_ID_RE = /\b(\d{9,12})\b/g;
const ITM_URL_RE = /\/itm\/(\d{9,12})\b/gi;

export function isLikelyEbayItemId(value: string | undefined): boolean {
  return Boolean(value && /^\d{9,12}$/.test(value.trim()));
}

function addId(
  seen: Set<string>,
  out: string[],
  value: string | undefined,
  skip?: string,
): void {
  const id = value?.trim();
  if (!id || !isLikelyEbayItemId(id)) return;
  if (skip && id === skip) return;
  if (seen.has(id)) return;
  seen.add(id);
  out.push(id);
}

export function collectCandidateItemIds(input: {
  conversationId?: string;
  referenceId?: string;
  referenceType?: string;
  conversationTitle?: string;
  messageBodies?: Array<string | undefined>;
}): string[] {
  const skip = input.conversationId?.trim();
  const seen = new Set<string>();
  const out: string[] = [];

  const refType = input.referenceType?.trim().toUpperCase();
  if (!refType || refType === "LISTING") {
    addId(seen, out, input.referenceId, skip);
  }

  const blobs = [
    input.conversationTitle ?? "",
    ...(input.messageBodies ?? []),
  ].join("\n");

  for (const match of blobs.matchAll(ITM_URL_RE)) {
    addId(seen, out, match[1], skip);
  }

  for (const match of blobs.matchAll(
    /\b(?:item\s*(?:id|number|#)|n[°o]\s*d['’]?article|itemid)\s*[:#]?\s*(\d{9,12})\b/gi,
  )) {
    addId(seen, out, match[1], skip);
  }

  // 12-digit IDs in the conversation title (eBay sometimes appends the item).
  const title = input.conversationTitle ?? "";
  for (const match of title.matchAll(/\b(\d{12})\b/g)) {
    addId(seen, out, match[1], skip);
  }

  // Avoid harvesting random numbers from message bodies via ITEM_ID_RE.
  void ITEM_ID_RE;

  return out;
}
