import type { ListingDetails } from "../ebay/tradingApi.js";
import { formatMoney } from "./listingFormat.js";
import { detectAllListingTopics } from "./listingEvidence.js";

const NEGO =
  /\b(meilleur|dernier)\s+prix\b|\bmarge\s+de\s+n[ée]goci|\bn[ée]goci|\bbest\s+price\b|\bbest\s+offer\b|\brémis[ea]\b|\bfaites\s+une\s+offre\b/i;

const COUNTER =
  /^(ok[,.]?\s*)?(m[eê]me\s+[aà]\s+)?\d{3,4}([,.][\d]{1,2})?(\s*(€|eur))?\s*[!.]*$/i;

export function isCounterOffer(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  if (COUNTER.test(raw)) return true;
  return /\bm[eê]me\s+[aà]\s+\d{3,4}\b/i.test(raw);
}

export function isPriceNegotiationAsk(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  if (isCounterOffer(raw)) return true;
  return NEGO.test(raw);
}

/**
 * Prix ferme, ton vendeur (« on ») — pas de jargon « non autorisée »,
 * pas d'invitation à faire une offre.
 */
export function formatFirmPriceReply(input: {
  message: string | undefined;
  listing?: ListingDetails;
  languageCode?: string;
  signature?: string;
}): string | null {
  const message = input.message ?? "";
  if (!isPriceNegotiationAsk(message)) return null;

  const en = input.languageCode === "en";
  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  const price =
    formatMoney(input.listing?.price, input.listing?.currency) ||
    formatMoney(input.listing?.buyItNowPrice, input.listing?.currency);
  const topics = detectAllListingTopics(message);
  const askedStock =
    topics.includes("available") ||
    /\b(dispo|disponible|en stock)\b/i.test(message);
  const bits: string[] = [];

  if (askedStock) {
    bits.push(en ? "Yes it's still available." : "Oui c'est tjr dispo.");
  }

  if (isCounterOffer(message)) {
    bits.push(
      en
        ? `Sorry, we have to stay at ${price ?? "the listed price"}, we can't really go lower.`
        : `Désolé on reste à ${price ?? "celui de l'annonce"}, on peut pas vraiment faire moins.`,
    );
  } else {
    bits.push(
      en
        ? `Sorry, the price is ${price ?? "the one on the listing"}, we can't really go lower.`
        : `Désolé le prix c'est ${price ?? "celui de l'annonce"}, on peut pas vraiment descendre.`,
    );
  }

  const body = bits.join(" ");
  return en ? `Hi,\n\n${body}\n\n${sig}` : `Bonjour,\n\n${body}\n\n${sig}`;
}
