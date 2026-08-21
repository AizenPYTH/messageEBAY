import type { ListingDetails } from "../ebay/tradingApi.js";
import {
  SAME_DAY_BEFORE_15,
  shippingPhraseFromDispatch,
} from "../seller/casualPhrases.js";

/**
 * Dispatch = when WE ship.
 * Delivery ETA = transit after shipping (buyer often says "délai de livraison").
 * Never answer Italy delivery with same-day dispatch alone.
 */

export type DeliveryDestination = {
  key: string;
  labelFr: string;
  /** Indicative transit after dispatch (business days). */
  daysMin: number;
  daysMax: number;
};

const DESTINATIONS: Array<{
  key: string;
  labelFr: string;
  daysMin: number;
  daysMax: number;
  patterns: RegExp[];
}> = [
  {
    key: "it",
    labelFr: "l'Italie",
    // La Poste lettre suivie internationale UE : indicatif ~4–5 jours ouvrés
    daysMin: 4,
    daysMax: 5,
    patterns: [/\bitalie\b/i, /\bitaly\b/i, /\bitalia\b/i],
  },
  {
    key: "es",
    labelFr: "l'Espagne",
    daysMin: 4,
    daysMax: 5,
    patterns: [/\bespagne\b/i, /\bspain\b/i, /\bespa[nñ]a\b/i],
  },
  {
    key: "de",
    labelFr: "l'Allemagne",
    daysMin: 3,
    daysMax: 5,
    patterns: [/\ballemagne\b/i, /\bgermany\b/i, /\bdeutschland\b/i],
  },
  {
    key: "be",
    labelFr: "la Belgique",
    daysMin: 2,
    daysMax: 4,
    patterns: [/\bbelgique\b/i, /\bbelgium\b/i, /\bbelgi[eë]\b/i],
  },
  {
    key: "pt",
    labelFr: "le Portugal",
    daysMin: 4,
    daysMax: 6,
    patterns: [/\bportugal\b/i],
  },
  {
    key: "nl",
    labelFr: "les Pays-Bas",
    daysMin: 3,
    daysMax: 5,
    patterns: [/\bpays[- ]bas\b/i, /\bnetherlands\b/i, /\bhollande\b/i],
  },
  {
    key: "uk",
    labelFr: "le Royaume-Uni",
    daysMin: 5,
    daysMax: 8,
    patterns: [/\broyaume[- ]uni\b/i, /\buk\b/i, /\bengland\b/i, /\bgreat\s+britain\b/i],
  },
  {
    key: "eu",
    labelFr: "l'UE",
    daysMin: 4,
    daysMax: 6,
    patterns: [/\bunion\s+europ/i, /\beurope\b/i, /\beu\b/i, /\bue\b/i],
  },
  {
    key: "fr",
    labelFr: "la France",
    daysMin: 2,
    daysMax: 3,
    patterns: [/\bfrance\b/i, /\bm[ée]tropole\b/i],
  },
];

const DELIVERY_ETA_ASK: RegExp[] = [
  /\bd[ée]lai\s+(de\s+|d['’])?livraison\b/i,
  /\btemps\s+de\s+livraison\b/i,
  /\blivraison\s+estim/i,
  /\bestimated\s+(delivery|shipping\s+time)\b/i,
  /\bdelivery\s+(time|eta|estimate)\b/i,
  /\bquando\s+(arriva|ricevo)\b/i,
  /\btempi?\s+di\s+(consegna|spedizione)\b/i,
  /\bcombien\s+de\s+(jours|temps).{0,40}\b(livr|arriv|ital|espagne|allemagn|belg)/i,
  /\bo[uù]\s+en\s+est.{0,20}\blivraison\b/i,
];

const DISPATCH_ASK: RegExp[] = [
  /\bd[ée]lai\s+d['’]?exp[ée]dition\b/i,
  /\bquand\s+(partez|exp[ée]diez|envoyez)\b/i,
  /\benvoi\s+le\s+jour\s+m[êe]me\b/i,
  /\benvoy(ez|er)\s+(ce\s+jour|aujourd)\b/i,
  /\bfast\s+ship/i,
  /\bdispatch\b/i,
];

export function isDeliveryEtaAsk(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  if (detectDestination(raw) && /\b(d[ée]lai|temps|jours?|livr|arriv|estim)\b/i.test(raw)) {
    return true;
  }
  return DELIVERY_ETA_ASK.some((re) => re.test(raw));
}

export function isDispatchAsk(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  return DISPATCH_ASK.some((re) => re.test(raw));
}

export function detectDestination(text: string | undefined): DeliveryDestination | null {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return null;
  // Prefer specific countries over generic "IT" / "EU" tokens.
  for (const d of DESTINATIONS) {
    if (d.key === "it" || d.key === "eu") continue;
    if (d.patterns.some((re) => re.test(raw))) {
      return {
        key: d.key,
        labelFr: d.labelFr,
        daysMin: d.daysMin,
        daysMax: d.daysMax,
      };
    }
  }
  for (const d of DESTINATIONS) {
    if (d.key !== "it" && d.key !== "eu") continue;
    if (d.patterns.some((re) => re.test(raw))) {
      return {
        key: d.key,
        labelFr: d.labelFr,
        daysMin: d.daysMin,
        daysMax: d.daysMax,
      };
    }
  }
  return null;
}

function listingTransitDays(
  listing: ListingDetails | undefined,
  international: boolean,
): { min: number; max: number } | null {
  const opts = (listing?.shippingOptions ?? []).filter((o) =>
    international ? o.international === true : o.international !== true,
  );
  for (const o of opts) {
    const min = Number(o.timeMin);
    const max = Number(o.timeMax);
    if (Number.isFinite(min) || Number.isFinite(max)) {
      return {
        min: Number.isFinite(min) ? min : max,
        max: Number.isFinite(max) ? max : min,
      };
    }
  }
  return null;
}

function formatDays(min: number, max: number): string {
  if (min === max) {
    return min <= 1 ? "1 jour ouvré" : `${min} jours ouvrés`;
  }
  return `${min}–${max} jours ouvrés`;
}

/**
 * Build a short seller line for shipping questions.
 * Prefers listing transit times; else known country ETAs (La Poste–style).
 */
export function formatShippingDelayReply(input: {
  message: string | undefined;
  listing?: ListingDetails;
}): string | null {
  const ask = (input.message ?? "").replace(/\s+/g, " ").trim();
  const dest = detectDestination(ask);
  const wantsDelivery = isDeliveryEtaAsk(ask) || Boolean(dest);
  const wantsDispatch = isDispatchAsk(ask) && !wantsDelivery;
  const dispatch =
    shippingPhraseFromDispatch(input.listing?.dispatchTimeMax) ?? SAME_DAY_BEFORE_15;

  if (wantsDelivery) {
    const international = dest ? dest.key !== "fr" : false;
    const fromListing = listingTransitDays(input.listing, international);
    const min =
      fromListing?.min ?? dest?.daysMin ?? (international ? 4 : 2);
    const max =
      fromListing?.max ?? dest?.daysMax ?? (international ? 6 : 3);
    const where = dest ? ` vers ${dest.labelFr}` : international ? " à l'étranger" : " en France";
    return `expédition le jour même avant 15h (sauf samedi/dimanche), puis environ ${formatDays(min, max)}${where} en suivi (indicatif)`;
  }

  if (wantsDispatch || /\b(envoi|exp[ée]dition|livraison|shipping|délai|delai)\b/i.test(ask)) {
    return dispatch;
  }

  return dispatch;
}
