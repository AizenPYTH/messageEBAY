/**
 * "Is the Touch Bar included?" — questions about what is physically in the box.
 *
 * The answer is usually visible on the listing photos, which this system cannot
 * read. Inventing "non, just the top case" is worse than saying nothing: the
 * buyer walks away from an item that did include it. When the listing text is
 * silent, so are we.
 */

import type { ListingDetails } from "../ebay/tradingApi.js";

type Component = {
  key: string;
  label: string;
  ask: RegExp;
  /** Words that count as the listing describing this component. */
  listing: RegExp;
};

const COMPONENTS: Component[] = [
  {
    key: "touchbar",
    label: "Touch Bar",
    ask: /\btouch\s*bar\b/i,
    listing: /\btouch\s*bar\b/i,
  },
  {
    key: "trackpad",
    label: "trackpad",
    ask: /\b(trackpad|touchpad|pav[ée]\s+tactile)\b/i,
    listing: /\b(trackpad|touchpad|pav[ée]\s+tactile)\b/i,
  },
  {
    key: "keyboard",
    label: "clavier",
    ask: /\b(clavier|keyboard)\b/i,
    listing: /\b(clavier|keyboard)\b/i,
  },
  {
    key: "battery",
    label: "batterie",
    ask: /\b(batterie|battery)\b/i,
    listing: /\b(batterie|battery)\b/i,
  },
  {
    key: "speakers",
    label: "haut-parleurs",
    ask: /\b(haut[- ]parleurs?|speakers?)\b/i,
    listing: /\b(haut[- ]parleurs?|speakers?)\b/i,
  },
  {
    key: "webcam",
    label: "webcam",
    ask: /\b(webcam|cam[ée]ra\s+frontale|facetime)\b/i,
    listing: /\b(webcam|cam[ée]ra|facetime)\b/i,
  },
  {
    key: "fan",
    label: "ventilateur",
    ask: /\b(ventilateur|fan)\b/i,
    listing: /\b(ventilateur|fan)\b/i,
  },
  {
    key: "charger",
    label: "chargeur",
    ask: /\b(chargeur|charger|alimentation|power\s+supply|c[âa]ble\s+de\s+charge)\b/i,
    listing: /\b(chargeur|charger|alimentation|power\s+supply)\b/i,
  },
  {
    key: "screws",
    label: "vis",
    ask: /\bvis\b/i,
    listing: /\bvis\b/i,
  },
  {
    key: "cable",
    label: "nappe",
    ask: /\b(nappe|flex\s+cable)\b/i,
    listing: /\b(nappe|flex)\b/i,
  },
];

const INCLUSION_ASK: RegExp[] = [
  /\b(inclus|incluse|include[ds]?|fourni|fournie|livr[ée]\s+avec|avec\s+le|avec\s+la|comprend|comprenant|contient|dedans|inside|included|comes\s+with)\b/i,
  /\best[- ]ce\s+qu[' ]?il\s+y\s+a\b/i,
  /\bil\s+y\s+a[- ]t[- ]il\b/i,
  /\by\s+a[- ]t[- ]il\b/i,
  /\bis\s+the\b.{0,30}\bincluded\b/i,
];

function listingBlob(listing: ListingDetails | undefined): string {
  if (!listing) return "";
  return [
    listing.title ?? "",
    listing.descriptionText ?? "",
    ...listing.itemSpecifics.map((s) => `${s.name} ${s.value}`),
    ...listing.variations.flatMap((v) =>
      v.specifics.map((s) => `${s.name} ${s.value}`),
    ),
  ].join(" \n ");
}

/** Components named in the buyer's question. */
export function askedComponents(message: string | undefined): Component[] {
  const raw = message ?? "";
  if (!raw.trim()) return [];
  return COMPONENTS.filter((c) => c.ask.test(raw));
}

export function isContentsAsk(message: string | undefined): boolean {
  const raw = message ?? "";
  if (!raw.trim()) return false;
  if (askedComponents(raw).length === 0) return false;
  return INCLUSION_ASK.some((re) => re.test(raw));
}

/**
 * The buyer asked whether something is in the box and the listing text never
 * mentions it. Only the photos could settle it, so the seller answers this one.
 */
export function unprovableContentsAsk(input: {
  message: string | undefined;
  listing: ListingDetails | undefined;
}): { unprovable: boolean; components: string[] } {
  if (!isContentsAsk(input.message)) {
    return { unprovable: false, components: [] };
  }
  const blob = listingBlob(input.listing);
  const silent = askedComponents(input.message).filter(
    (c) => !c.listing.test(blob),
  );
  return {
    unprovable: silent.length > 0,
    components: silent.map((c) => c.label),
  };
}

/** A draft that denies a component the listing never rules out. */
export function replyDeniesUnprovenComponent(input: {
  reply: string | undefined;
  message: string | undefined;
  listing: ListingDetails | undefined;
}): boolean {
  const { unprovable } = unprovableContentsAsk({
    message: input.message,
    listing: input.listing,
  });
  if (!unprovable) return false;
  const reply = input.reply ?? "";
  return /\b(non|no|pas\s+(?:de|inclus|fourni)|n['’]est\s+pas\s+(?:inclus|fourni)|sans\s+|only\s+the|just\s+the|uniquement\s+(?:le|la))\b/i.test(
    reply,
  );
}
