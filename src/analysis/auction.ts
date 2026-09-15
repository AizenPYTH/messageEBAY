/**
 * Auctions.
 *
 * An auction listing has no Buy It Now, so confirming one is a promise the shop
 * cannot keep. The listing format is the only thing that settles it — never the
 * wording of the question.
 */

import type { ListingDetails } from "../ebay/tradingApi.js";
import { parseListingPrice } from "./sellerCase.js";

export function isAuctionListing(listing: ListingDetails | undefined): boolean {
  const type = (listing?.listingType ?? "").toLowerCase();
  // eBay calls a plain auction "Chinese"; "AuctionWithBIN" does have a BIN.
  return type === "chinese" || type === "auction";
}

/** The auction also offers Buy It Now (only until the first bid). */
export function auctionHasBuyItNow(listing: ListingDetails | undefined): boolean {
  if (!isAuctionListing(listing)) return false;
  const bin = parseListingPrice(listing?.buyItNowPrice ?? undefined);
  return bin !== undefined && bin > 0 && (listing?.bidCount ?? 0) === 0;
}

export function isBuyItNowAsk(text: string | undefined): boolean {
  const raw = text ?? "";
  return [
    /\bachat\s+imm[ée]diat\b/i,
    /\bacheter\s+(?:tout\s+de\s+suite|directement|maintenant|sans\s+ench[ée]rir)\b/i,
    /\bbuy\s+it\s+now\b/i,
    /\bbin\b/i,
    /\bprix\s+d['’]?achat\s+imm[ée]diat\b/i,
  ].some((re) => re.test(raw));
}

export function isAuctionPriceAsk(text: string | undefined): boolean {
  const raw = text ?? "";
  return /\b(prix|combien|co[ûu]te|how much|price)\b/i.test(raw);
}

/** Payment stays on eBay, whatever the buyer proposes. */
export function isOffPlatformPaymentAsk(text: string | undefined): boolean {
  const raw = text ?? "";
  return [
    /\bpaypal\b/i,
    /\bvirement\b/i,
    /\besp[èe]ces\b/i,
    /\bhors\s+ebay\b/i,
    /\ben\s+direct\b/i,
    /\bbank\s+transfer\b/i,
  ].some((re) => re.test(raw));
}

/**
 * Says no to Buy It Now, gives the live price, and points at the only two
 * actions that exist on an auction: bid, or wait for the end.
 */
export function formatAuctionReply(input: {
  listing: ListingDetails | undefined;
  askedBuyItNow: boolean;
  askedOffPlatformPayment: boolean;
  languageCode?: string;
  signature?: string;
}): string | null {
  if (!isAuctionListing(input.listing)) return null;
  if (!input.askedBuyItNow && !input.askedOffPlatformPayment) return null;

  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  const current = parseListingPrice(input.listing?.price ?? undefined);
  const currency =
    (input.listing?.currency ?? "EUR").toUpperCase() === "USD" ? "$" : "€";
  const shown =
    current === undefined
      ? null
      : Number.isInteger(current)
        ? `${current} ${currency}`
        : `${current.toFixed(2).replace(".", ",")} ${currency}`;

  const parts: string[] = [];
  if (input.askedBuyItNow) {
    if (auctionHasBuyItNow(input.listing)) {
      const bin = parseListingPrice(input.listing?.buyItNowPrice ?? undefined);
      const binShown =
        bin === undefined
          ? null
          : Number.isInteger(bin)
            ? `${bin} ${currency}`
            : `${bin.toFixed(2).replace(".", ",")} ${currency}`;
      parts.push(
        input.languageCode === "en"
          ? `Yes, Buy It Now is available${binShown ? ` at ${binShown}` : ""}, straight from the listing.`
          : `Oui, l'achat immédiat est possible${binShown ? ` à ${binShown}` : ""}, directement depuis l'annonce.`,
      );
    } else {
      parts.push(
        input.languageCode === "en"
          ? `No, it's an auction, there's no Buy It Now${shown ? `. Current bid is ${shown}` : ""}.`
          : `Non, c'est une enchère, il n'y a pas d'achat immédiat${shown ? `. Le prix actuel est à ${shown}` : ""}.`,
      );
    }
  }
  if (input.askedOffPlatformPayment) {
    parts.push(
      input.languageCode === "en"
        ? "Payment goes through eBay only."
        : "Le paiement se fait uniquement sur eBay.",
    );
  }
  if (parts.length === 0) return null;

  const hello = input.languageCode === "en" ? "Hi," : "Bonjour,";
  return `${hello}\n\n${parts.join(" ")}\n\n${sig}`;
}
