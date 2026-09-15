import type { ListingDetails } from "../ebay/tradingApi.js";
import { listingHasDomesticFreeShipping } from "../shipping/shippingCost.js";

const AUCTION_TYPES = new Set(["chinese", "dutch", "live", "auction"]);
const BIN_TYPES = new Set(["fixedpriceitem", "storesfixedprice"]);

const BIN_ASK =
  /\b(achat\s+imm[ée]diat|acheter\s+maintenant|buy\s*it\s*now|\bbin\b)\b/i;

const PRICE_ASK =
  /\b(quel\s+prix|c['’]?est\s+combien|combien\s+(co[uû]te|le prix|le t[ée]l[ée]phone)|prix\s+du\s+(t[ée]l[ée]phone|article|produit|portable)|how much)\b/i;

const GENERIC_PRICE_ASK = /\b(prix|tarif|combien)\b/i;

const NEGOTIATION =
  /\b(meilleur|dernier)\s+prix\b|\bfaites\s+une\s+offre\b|\bbest\s+offer\b|\bn[ée]goci/i;

const PAYPAL_OFF_EBAY =
  /\b(votre\s+)?paypal\b|\bpay\s*pal\b/i;

const SHIPPING_PRICE_ONLY =
  /\b(frais|co[uû]t)\s+(de\s+)?(port|livraison|envoi)\b|\blivraison\s+[àa]\s+0\b/i;

export function isAuctionListing(listing: ListingDetails | undefined): boolean {
  const t = (listing?.listingType ?? "").toLowerCase();
  if (AUCTION_TYPES.has(t)) return true;
  if (BIN_TYPES.has(t)) return false;
  const bids = Number(listing?.bidCount ?? 0);
  return Number.isFinite(bids) && bids > 0;
}

function amount(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const n = Number.parseFloat(value.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function listingHasBuyItNow(listing: ListingDetails | undefined): boolean {
  if (!listing) return false;
  if (isAuctionListing(listing)) {
    return amount(listing.buyItNowPrice) !== undefined;
  }
  const t = (listing.listingType ?? "").toLowerCase();
  if (t === "adtype") return false;
  if (BIN_TYPES.has(t)) return true;
  return !isAuctionListing(listing);
}

export function formatMoney(
  value: string | undefined,
  currency?: string,
): string | null {
  const n = amount(value);
  if (n === undefined) return null;
  const cur = (currency ?? "EUR").toUpperCase() === "EUR" ? "€" : currency ?? "€";
  const shown = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
  return `${shown} ${cur}`;
}

export function isBuyItNowAsk(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  return BIN_ASK.test(raw);
}

export function isItemPriceAsk(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  if (NEGOTIATION.test(raw)) return false;
  if (SHIPPING_PRICE_ONLY.test(raw) && !/\bprix\s+du\s+(t[ée]l[ée]phone|article|produit)/i.test(raw)) {
    return false;
  }
  return PRICE_ASK.test(raw) || GENERIC_PRICE_ASK.test(raw);
}

export function asksPaypalOffEbay(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  if (/\b(j['’]ai|je\s+vais)\s+contact[eé].{0,40}paypal/i.test(raw)) return false;
  if (/\blitige|dispute|rembours/i.test(raw)) return false;
  return (
    PAYPAL_OFF_EBAY.test(raw) &&
    /\b(donner|donne[rz]|votre|payer|payez|paiement|r[eé]gler|envoyer)\b/i.test(raw)
  );
}

export function wantsPurchaseHowReply(text: string | undefined): boolean {
  return (
    isBuyItNowAsk(text) ||
    isItemPriceAsk(text) ||
    asksPaypalOffEbay(text)
  );
}

function currentListingPrice(listing: ListingDetails | undefined): string | null {
  return (
    formatMoney(listing?.price, listing?.currency) ||
    formatMoney(listing?.startPrice, listing?.currency) ||
    formatMoney(listing?.buyItNowPrice, listing?.currency)
  );
}

/**
 * Achat immédiat / prix / paiement eBay — d'après le format réel de l'annonce.
 * Enchère ≠ achat immédiat. Pas de PayPal hors eBay.
 */
export function formatPurchaseHowReply(input: {
  message: string | undefined;
  listing?: ListingDetails;
  languageCode?: string;
  signature?: string;
}): string | null {
  const message = input.message ?? "";
  if (!wantsPurchaseHowReply(message)) return null;
  if (NEGOTIATION.test(message)) return null;

  const en = input.languageCode === "en";
  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  const auction = isAuctionListing(input.listing);
  const bin = listingHasBuyItNow(input.listing);
  const price = currentListingPrice(input.listing);
  const binPrice = formatMoney(input.listing?.buyItNowPrice, input.listing?.currency);
  const askedBin = isBuyItNowAsk(message);
  const askedPrice = isItemPriceAsk(message);
  const askedPaypal = asksPaypalOffEbay(message);
  const france = /\bfrance\b/i.test(message);
  const bits: string[] = [];

  if (auction && !bin) {
    if (askedBin) {
      bits.push(
        en
          ? "No, this is an auction, not Buy It Now."
          : "Non, c'est une enchère, pas un achat immédiat.",
      );
    } else {
      bits.push(
        en
          ? "This listing is an auction (no Buy It Now)."
          : "C'est une enchère, pas d'achat immédiat.",
      );
    }
    if (askedPrice || askedBin || askedPaypal) {
      bits.push(
        en
          ? `Current bid is ${price ?? "on the listing"} — you bid and pay on eBay.`
          : `Le prix actuel est ${price ?? "celui de l'annonce"} — il faut enchérir et payer sur eBay.`,
      );
    }
  } else if (auction && bin) {
    if (askedBin) {
      bits.push(
        en
          ? `Yes, Buy It Now is available${binPrice ? ` at ${binPrice}` : ""}.`
          : `Oui, l'achat immédiat est possible${binPrice ? ` à ${binPrice}` : ""}.`,
      );
    }
    if (askedPrice) {
      bits.push(
        en
          ? `Current bid ${price ?? "on the listing"}${binPrice ? `, or Buy It Now ${binPrice}` : ""}.`
          : `Enchère en cours ${price ?? "sur l'annonce"}${binPrice ? `, ou achat immédiat ${binPrice}` : ""}.`,
      );
    }
  } else {
    if (askedBin) {
      bits.push(
        en
          ? `Yes, Buy It Now is available${price ? ` at ${price}` : ""}.`
          : `Oui, l'achat immédiat est possible${price ? ` à ${price}` : ""}.`,
      );
    } else if (askedPrice) {
      bits.push(
        en
          ? `The price is ${price ?? "the one on the listing"}, Buy It Now on eBay.`
          : `Le prix est ${price ?? "celui de l'annonce"}, achat immédiat sur eBay.`,
      );
    }
  }

  if (askedPaypal) {
    bits.push(
      en
        ? "I don't take PayPal aside — payment is only through eBay."
        : "Je ne prends pas PayPal à part, le paiement se fait uniquement via eBay.",
    );
  }

  if (france && listingHasDomesticFreeShipping(input.listing)) {
    bits.push(en ? "Shipping in France is 0 €." : "Envoi France 0 €.");
  }

  if (bits.length === 0) return null;
  const body = bits.join(" ");
  return en ? `Hi,\n\n${body}\n\n${sig}` : `Bonjour,\n\n${body}\n\n${sig}`;
}
