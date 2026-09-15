import type { ListingDetails, ListingShippingOption } from "../ebay/tradingApi.js";

const COST_ASK: RegExp[] = [
  /\b(co[uû]t|frais)\s+(de\s+)?(livraison|port|envoi|exp[ée]dition)\b/i,
  /\b(livraison|port|shipping)\s+(trop\s+)?(cher|élev|eleve|high|expensive)\b/i,
  /\blivraison\s+[àa]\s+0\b/i,
  /\b0[,.]0\s*(€|eur)?\b/i,
  /\blivraison\s+gratuite\b/i,
  /\bfree\s+ship/i,
  /\bshipping\s+(cost|fee|price)\b/i,
  /\bpour\s+(la\s+)?livraison\b/i,
  /\bpossibilit[eé]\s+de\s+livraison\b/i,
  /\bspedizione\b/i,
];

const ASK_FREE: RegExp[] = [
  /\b0[,.]0\s*(€|eur)?\b/i,
  /(?<![\w\u00c0-\u024f])[àa]\s+0\s*(€|eur)?\b/i,
  /\bgratuit[e]?\b/i,
  /\bfree\s+ship/i,
  /\blivraison\s+gratuite\b/i,
];

const ABROAD_MARKERS: RegExp[] = [
  /\btraduit\b/i,
  /\btranslated\b/i,
  /\[traduit\]/i,
  /\[translated\]/i,
  /\besiste\b/i,
  /\banche\b/i,
  /\bconsegna\b/i,
  /\bgrazie\b/i,
  /\bspedizione\b/i,
  /\bcomunque\b/i,
  /\bcosto\s+(di|della)\b/i,
  /\bguten\s+tag\b/i,
  /\bversand\b/i,
  /\benv[ií]o\b/i,
];

export function isShippingCostAsk(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  return COST_ASK.some((re) => re.test(raw));
}

export function asksFreeShipping(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  return ASK_FREE.some((re) => re.test(raw));
}

/** Buyer looks abroad (eBay translation / IT/DE/ES) — FR 0 € does not apply. */
export function buyerLikelyAbroad(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  return ABROAD_MARKERS.some((re) => re.test(raw));
}

export function parseShippingCost(cost: string | undefined): number | undefined {
  if (!cost?.trim()) return undefined;
  const n = Number.parseFloat(
    cost.trim().replace(/\s/g, "").replace(",", ".").replace(/[^\d.-]/g, ""),
  );
  return Number.isFinite(n) ? n : undefined;
}

function isPickup(opt: ListingShippingOption): boolean {
  return /\b(pickup|retrait|local\s*pickup|enlevement|enlèvement)\b/i.test(
    opt.service ?? "",
  );
}

function isFreeMail(opt: ListingShippingOption): boolean {
  return parseShippingCost(opt.cost) === 0 && !isPickup(opt);
}

export function listingHasDomesticFreeShipping(
  listing: ListingDetails | undefined,
): boolean {
  return (listing?.shippingOptions ?? []).some(
    (o) => o.international !== true && isFreeMail(o),
  );
}

export function listingHasInternationalFreeShipping(
  listing: ListingDetails | undefined,
): boolean {
  return (listing?.shippingOptions ?? []).some(
    (o) => o.international === true && isFreeMail(o),
  );
}

/** True only if SOME non-pickup option is 0 — not “free for this buyer”. */
export function listingHasFreeShipping(listing: ListingDetails | undefined): boolean {
  return (listing?.shippingOptions ?? []).some((o) => isFreeMail(o));
}

function formatOption(opt: ListingShippingOption, currency?: string): string {
  const n = parseShippingCost(opt.cost);
  const price =
    n === 0
      ? "0 €"
      : n !== undefined
        ? `${String(opt.cost).replace(".", ",")} ${currency ?? "EUR"}`.trim()
        : opt.cost?.trim() || "?";
  const name = opt.service?.replace(/^(FR_|EU_|DE_|IT_)/i, "") || "envoi";
  const zone = opt.international ? " (étranger)" : " (France)";
  return `${name} ${price}${zone}`;
}

function internationalRates(listing: ListingDetails | undefined): string[] {
  return (listing?.shippingOptions ?? [])
    .filter((o) => o.international === true && !isPickup(o))
    .map((o) => formatOption(o, listing?.currency));
}

function domesticPaidRates(listing: ListingDetails | undefined): string[] {
  return (listing?.shippingOptions ?? [])
    .filter((o) => o.international !== true && !isPickup(o) && parseShippingCost(o.cost) !== 0)
    .map((o) => formatOption(o, listing?.currency));
}

/**
 * Answer shipping-cost questions from listing options only.
 * 0 € domestic = France only. Never invent 0 € for a foreign buyer.
 */
export function formatShippingCostReply(input: {
  listing?: ListingDetails;
  languageCode?: string;
  signature?: string;
  askedFree?: boolean;
  buyerAbroad?: boolean;
}): string {
  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  const en = input.languageCode === "en";
  const abroad = Boolean(input.buyerAbroad);
  const intlFree = listingHasInternationalFreeShipping(input.listing);
  const frFree = listingHasDomesticFreeShipping(input.listing);
  const intl = internationalRates(input.listing);
  const frPaid = domesticPaidRates(input.listing);

  let body: string;
  if (input.askedFree) {
    if (intlFree) {
      body = en
        ? "Yes, there is a 0 EUR international shipping option on the listing."
        : "Oui, il y a une option internationale à 0 € sur l'annonce.";
    } else if (frFree) {
      body = en
        ? `0 EUR shipping is France only. International rates are those on the listing${intl.length ? ` (${intl.join(" / ")})` : ""}, I can't set them to 0.`
        : `Le 0 € c'est uniquement pour la France. À l'étranger ce sont les frais internationaux de l'annonce${intl.length ? ` (${intl.join(" / ")})` : ""}, je ne peux pas les mettre à 0.`;
    } else {
      const rates = [...frPaid, ...intl].join(" / ");
      body = en
        ? `No 0 EUR shipping. Listing rates: ${rates || "as shown on the listing"}. I can't change them.`
        : `Non, pas de livraison à 0 €. Frais de l'annonce : ${rates || "ceux affichés"}. Je ne peux pas les modifier.`;
    }
  } else if (abroad && intl.length) {
    body = en
      ? `International shipping is as listed: ${intl.join(" / ")}. I can't change it.`
      : `À l'étranger les frais sont ceux de l'annonce : ${intl.join(" / ")}. Je ne peux pas les modifier.`;
  } else {
    const rates = [...(frFree ? ["0 € (France)"] : frPaid), ...intl].join(" / ");
    body = en
      ? `Shipping is as listed${rates ? `: ${rates}` : ""}. I can't change it.`
      : `Les frais d'envoi sont ceux de l'annonce${rates ? ` : ${rates}` : ""}. Je ne peux pas les modifier.`;
  }

  return en ? `Hi,\n\n${body}\n\n${sig}` : `Bonjour,\n\n${body}\n\n${sig}`;
}

/** True if a draft invents free shipping the buyer would not get. */
export function replyInventsFreeShipping(
  reply: string | undefined,
  listing: ListingDetails | undefined,
  _buyerAbroad?: boolean,
): boolean {
  const raw = reply ?? "";
  if (
    !/\b0[,.]0\s*(?:€|eur)?\b|\blivraison\s+[àa]\s+0\b|\bfree\s+ship|\b0\s*(?:€|eur)\b|\blivraison en suivi à 0/i.test(
      raw,
    )
  ) {
    return false;
  }
  if (listingHasInternationalFreeShipping(listing)) return false;
  const qualifiedFranceOnly =
    /uniquement pour la france|france only|pas pour l['’]?étranger|not for international|\(france\)/i.test(
      raw,
    );
  if (qualifiedFranceOnly) return false;
  return true;
}
