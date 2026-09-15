/**
 * Price haggling.
 *
 * The shop's line is simple: the price is the price, said like a colleague and
 * not like a terms-of-service page. "La négociation n'est pas autorisée" reads
 * as a rebuke, and "faites une proposition" invites a round of offers the
 * seller will refuse anyway — both cost the sale.
 */

import { parseListingPrice } from "./sellerCase.js";

const OFFER_VERBS =
  /\b(propose|proposer|proposition|offre|offrir|acceptez|accepteriez|prendriez|prenez|laisser|c[ée]der|vendre)\b/i;

const NEGOTIATION_WORDS: RegExp[] = [
  /\bmeilleur\s+prix\b/i,
  /\bdernier\s+prix\b/i,
  /\bprix\s*ferme\b/i,
  /\bprix\b[^?.!]{0,12}\bferme\b/i,
  /\bn[ée]gociable\b/i,
  /\bn[ée]goci/i,
  /\br[ée]duction\b/i,
  /\bremise\b(?!\s+en\s+(?:main|[ée]tat|service|route))/i,
  /\brabais\b/i,
  /\bun\s+geste\b/i,
  /\bbaisser\s+(le\s+)?prix\b/i,
  /\bfaire\s+un\s+(petit\s+)?prix\b/i,
  /\bbest\s+price\b/i,
  /\bwould\s+you\s+take\b/i,
  /\bany\s+discount\b/i,
  /\blower\s+price\b/i,
];

/** "je vous en donne 340", "340 € ?", "vous accepteriez 420 euros" */
const AMOUNT_WITH_CURRENCY = /(\d{1,5}(?:[.,]\d{1,2})?)\s*(?:€|eur\b|euros?\b)/gi;
// No leading \b: "à" is not an ASCII word char, so `(?<![\w\u00c0-\u024f])[àa]` never matches.
const AMOUNT_AFTER_VERB =
  /(?:^|\W)(?:propose|offre|donne|prend(?:s|rais)?|accepter(?:iez|ais)|laisser|c[ée]der|vendre|pour|[àa])\s+(\d{2,5}(?:[.,]\d{1,2})?)\b/gi;

export function isPriceNegotiation(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  if (NEGOTIATION_WORDS.some((re) => re.test(raw))) return true;
  // A bare amount is only an offer when something proposes it.
  return OFFER_VERBS.test(raw) && extractOfferedAmount(raw) !== undefined;
}

/** "A1989", "SM-A137F", "iPhone 13" — model names, never prices. */
function stripModelNames(text: string): string {
  return text
    .replace(/\b(?:sm[- ]?)?[a-z]{1,2}\d{3,4}[a-z]{0,2}\b/gi, " ")
    .replace(
      /\b(iphone|ipad|macbook|imac|galaxy|redmi|poco|pixel|surface|note|tab|mi)\s*\d{1,3}\b/gi,
      " ",
    );
}

/** The number the buyer put on the table, when there is one. */
export function extractOfferedAmount(text: string | undefined): number | undefined {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return undefined;

  const amounts: number[] = [];
  // A currency symbol settles it, model name or not.
  for (const m of raw.matchAll(AMOUNT_WITH_CURRENCY)) {
    const value = Number((m[1] ?? "").replace(",", "."));
    if (Number.isFinite(value)) amounts.push(value);
  }
  if (amounts.length === 0) {
    // A bare number only counts once the model names are out of the way.
    for (const m of stripModelNames(raw).matchAll(AMOUNT_AFTER_VERB)) {
      const value = Number((m[1] ?? "").replace(",", "."));
      if (Number.isFinite(value)) amounts.push(value);
    }
  }
  if (amounts.length === 0) return undefined;
  return Math.max(...amounts);
}

/**
 * Phrases that turn a refusal into either a lecture or an invitation to haggle.
 * Both are banned, so a draft containing one is never sent as-is.
 */
export function replyInvitesNegotiation(reply: string | undefined): boolean {
  const raw = reply ?? "";
  return [
    /n[ée]gociation\s+n['’]est\s+pas\s+autoris/i,
    /n['’]est\s+pas\s+autoris[ée]/i,
    /\bfaites?\s+(?:nous\s+)?une\s+(?:proposition|offre)\b/i,
    /\bfaire\s+une\s+offre\b/i,
    /\bproposez[- ]\s*(?:nous|moi)\b/i,
    /\bdiscut(?:er|ez|ons)\s+(?:du|le|d['’]un)\s+prix\b/i,
    /\bouvert\s+[àa]\s+la\s+n[ée]gociation\b/i,
    /\bmake\s+an?\s+offer\b/i,
  ].some((re) => re.test(raw));
}

/**
 * Firm, short, and human. No jargon, no invitation to come back with a number.
 */
export function formatFirmPriceReply(input: {
  listingPrice?: string | null;
  currency?: string | null;
  languageCode?: string;
  signature?: string;
}): string | null {
  const amount = parseListingPrice(input.listingPrice ?? undefined);
  if (amount === undefined) return null;
  const currency = (input.currency ?? "EUR").toUpperCase() === "USD" ? "$" : "€";
  const shown = Number.isInteger(amount)
    ? `${amount} ${currency}`
    : `${amount.toFixed(2).replace(".", ",")} ${currency}`;
  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";

  if (input.languageCode === "en") {
    return `Hi,\n\nSorry, the price is ${shown}, we can't really go lower.\n\n${sig}`;
  }
  return `Bonjour,\n\nDésolé, le prix c'est ${shown}, on peut pas vraiment descendre.\n\n${sig}`;
}
