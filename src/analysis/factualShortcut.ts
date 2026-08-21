import { detectAllListingTopics } from "./listingEvidence.js";
import { isBuyerReturnShipped } from "./sellerCase.js";
import { isInboundSellOffer } from "./sellerCase.js";

/**
 * Factual shortcuts (stock templates, catalog links, Apple SKU replies)
 * exist only for a short unambiguous stock/shipping yes-no.
 * Diagnosis, returns, “I have a MacBook A1466 that won’t boot” must NEVER
 * be answered with “yes A1466 is in stock, here’s the link”.
 */

const OWN_DEVICE: RegExp[] = [
  /\bj['’]?\s*ai\s+(un|une|le|la|mon|ma)\b/i,
  /\bmon\s+(mac|macbook|iphone|ipad|pc|portable|ordinateur|surface)\b/i,
  /\bmy\s+(mac|macbook|iphone|ipad|laptop|computer|surface)\b/i,
];

const DEVICE_WORDS =
  /\b(macbook|mac\s*book|iphone|ipad|surface|ordinateur|portable|laptop)\b/i;

const DIAGNOSIS: RegExp[] = [
  /\bne\s+s['’]?allume\b/i,
  /\bne\s+s['’]?allume\s+plus\b/i,
  /\bne\s+fonctionne\b/i,
  /\bcarte\s+logique\b/i,
  /\blogic\s+board\b/i,
  /\b(diagnost|panne|cause\s+(du|de)|probl[eè]me)\b/i,
  /\bje\s+ne\s+suis\s+pas\s+certain\b/i,
  /\bi['’]?m\s+not\s+sure\b/i,
  /\bwhether\s+(it['’]?s|the)\s+(the\s+)?(logic|board|i\/?o)\b/i,
];

const RETURN_OR_REFUND: RegExp[] = [
  /\bretourn/i,
  /\breturn\b/i,
  /\brembours/i,
  /\brefund\b/i,
  /\bpourrai[st]?\s+.{0,20}\bretourn/i,
  /\bpui[sx][- ]je\s+retourn/i,
  /\bcan\s+i\s+return\b/i,
];

export function isBuyerOwnDeviceContext(text: string | undefined): boolean {
  const raw = text?.trim() ?? "";
  if (!raw) return false;
  if (!DEVICE_WORDS.test(raw) && !/\bA\d{4}\b/i.test(raw)) return false;
  return OWN_DEVICE.some((re) => re.test(raw));
}

export function isDiagnosticAsk(text: string | undefined): boolean {
  const raw = text?.trim() ?? "";
  if (!raw) return false;
  return DIAGNOSIS.some((re) => re.test(raw));
}

export function mentionsReturnPolicyAsk(text: string | undefined): boolean {
  const raw = text?.trim() ?? "";
  if (!raw) return false;
  return RETURN_OR_REFUND.some((re) => re.test(raw));
}

/** True → do not use stock/catalog/Apple templates. */
export function blocksFactualShortcut(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  if (mentionsReturnPolicyAsk(raw)) return true;
  if (isBuyerReturnShipped(raw)) return true;
  if (isInboundSellOffer(raw)) return true;
  if (isBuyerOwnDeviceContext(raw)) return true;
  if (isDiagnosticAsk(raw)) return true;
  const words = raw.split(/\s+/).filter(Boolean).length;
  if (words > 32) return true;
  if ((raw.match(/\?/g) ?? []).length >= 2) return true;
  return false;
}

/**
 * Only a short closed stock or shipping question may use templates.
 */
export function allowFactualShortcut(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  if (blocksFactualShortcut(raw)) return false;
  const topics = detectAllListingTopics(raw);
  if (topics.length === 0) return false;
  return topics.every(
    (t) => t === "available" || t === "fast_shipping",
  );
}
