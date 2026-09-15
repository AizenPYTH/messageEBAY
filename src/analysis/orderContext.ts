/**
 * Questions about an order that already exists.
 *
 * "Avez-vous des retours par rapport à ma commande ?" asks for news about a
 * parcel, not for the catalogue. Answering it with another listing reads as if
 * nobody looked at the order at all, which is exactly how it landed on the
 * arapu17 thread.
 */

/**
 * Matched against accent-stripped text: in JavaScript `\b` is ASCII-only, so
 * "command\u00e9\b" never matches at the end of a word.
 */
function normalize(text: string | undefined): string {
  return (text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .trim();
}

const ORDER_MARKERS: RegExp[] = [
  /\b(ma|mes|la|cette|notre)\s+commandes?\b/,
  /\bmon\s+(colis|achat|article|paquet)\b/,
  /\bj'ai\s+(commande|achete|paye|recu|pris)\b/,
  /\bce\s+que\s+j'ai\s+commande\b/,
  /\bcommande\s+(passee|du|no|numero|n)\b/,
  /\bmy\s+order\b/,
  /\bmy\s+(parcel|package)\b/,
  /\bi\s+ordered\b/,
  /\border\s+number\b/,
];

const NEWS_MARKERS: RegExp[] = [
  /\bdes\s+(nouvelles|retours|infos?|informations?)\b/,
  /\bou\s+en\s+est\b/,
  /\bsuivi\b/,
  /\btracking\b/,
  /\bexpedi/,
  /\benvoye\b/,
  /\bany\s+news\b/,
  /\bupdate\b/,
];

/** True when the buyer is talking about something they already bought. */
export function isAboutExistingOrder(text: string | undefined): boolean {
  const raw = normalize(text);
  if (!raw) return false;
  if (ORDER_MARKERS.some((re) => re.test(raw))) return true;
  // "Des nouvelles de l'expédition ?" — news wording with a dispatch marker.
  return (
    NEWS_MARKERS.filter((re) => re.test(raw)).length >= 2 &&
    /\b(expedi|envoi|colis|suivi|livraison)\b/.test(raw)
  );
}

const EBAY_ITEM_URL = /ebay\.[a-z.]+\/itm\/(\d{6,})/gi;

/** Item ids linked in a reply. */
export function linkedItemIds(reply: string | undefined): string[] {
  const out: string[] = [];
  for (const m of (reply ?? "").matchAll(EBAY_ITEM_URL)) {
    const id = m[1];
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/**
 * True when a reply answers an order question by pushing another listing —
 * a catalogue link, or a stock line, for an item that is not the order's.
 */
export function replyPushesOtherListing(input: {
  reply: string | undefined;
  currentItemId?: string;
}): boolean {
  const reply = input.reply ?? "";
  const foreign = linkedItemIds(reply).filter(
    (id) => !input.currentItemId || id !== input.currentItemId,
  );
  if (foreign.length > 0) return true;
  return /\b(?:on\s+a|nous\s+avons|we\s+have)\b[^.]{0,60}\ben\s+stock\b/i.test(reply);
}
