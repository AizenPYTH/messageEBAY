/**
 * Casual seller phrasing — short eBay chat, not ChatGPT.
 */

/** Same-day dispatch rule remembered for this seller. */
export const SAME_DAY_BEFORE_15 =
  "envoi le jour même avant 15h (sauf samedi et dimanche)";

export function shippingPhraseFromDispatch(
  dispatchTimeMax: string | undefined,
): string | null {
  if (dispatchTimeMax === undefined || dispatchTimeMax === "") return null;
  if (dispatchTimeMax === "0") {
    return SAME_DAY_BEFORE_15;
  }
  const days = Number(dispatchTimeMax);
  if (!Number.isFinite(days)) return null;
  if (days <= 1) return "expédition sous 1 jour ouvré";
  return `expédition sous ${days} jours ouvrés`;
}

/** Short nickname for the conversation listing ("clavier", "écran"…). */
export function casualProductNickname(title: string | undefined | null): string {
  const raw = title?.trim() ?? "";
  const t = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/clavier|topcase|keyboard/.test(t)) return "clavier";
  if (/ecran|lcd|display/.test(t)) return "écran";
  if (/batterie|battery/.test(t)) return "batterie";
  if (/carte\s*mere|motherboard/.test(t)) return "carte mère";
  if (/touchpad|trackpad/.test(t)) return "touchpad";
  if (/chargeur|charger/.test(t)) return "chargeur";
  if (/coque|chassis|ch[aâ]ssis/.test(t)) return "coque";
  const words = raw
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 2);
  return words.join(" ").toLowerCase() || "article";
}

/** Soften a catalog title for casual chat. */
export function casualCatalogLabel(title: string, askedLabel?: string | null): string {
  const t = title.toLowerCase();
  if (/lyca|sim/.test(t)) return "carte sim Lyca";
  if (askedLabel?.trim()) {
    const a = askedLabel.trim().toLowerCase();
    if (/puce|lyca|sim/.test(a)) return "carte sim Lyca";
    return askedLabel.trim();
  }
  // First ~6 words max
  return title.split(/\s+/).slice(0, 6).join(" ");
}
