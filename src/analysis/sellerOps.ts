/**
 * Operational seller rules that are always true for this shop:
 * no local pickup, no auto invoice promises, repair listings are untested.
 * Générique / Grade A spare parts are sold working — not "for parts".
 */

const PICKUP_ASK: RegExp[] = [
  /\bmain\s*propre\b/i,
  /\bsur\s+place\b/i,
  /\bretrait\s+(local|sur\s+place|en\s+magasin|possible)\b/i,
  /\bpasser\s+(le\s+)?(prendre|chercher|r[ée]cup)/i,
  /\bvenir\s+(le\s+)?(prendre|chercher|r[ée]cup)/i,
  /\bpick\s*up\b/i,
  /\blocal\s+pickup\b/i,
  /\br[ée]cup[ée]rer\b/i,
  /\ble\s+r[ée]cup[ée]r/i,
];

const PICKUP_NOT_LOCAL: RegExp[] = [
  /\b(colis|suivi|tracking|point\s+relais|la\s+poste|chronopost|mondial\s+relay)\b/i,
];

const INVOICE_ASK: RegExp[] = [
  /\bfacture\b/i,
  /\binvoice\b/i,
  /\bavec\s+tva\b/i,
  /\bfacture\s+tva\b/i,
];

const REPAIR_LISTING: RegExp[] = [
  /\bpour\s+r[ée]paration\b/i,
  /\bpour\s+pi[eè]ces?\b/i,
  /\bred[ée]marre\s+en\s+boucle\b/i,
  /\bbootloop\b/i,
  /\b[ée]cran\s+(lcd\s+)?cass/i,
  /\bne\s+s['’]?allume\s+plus\b/i,
];

export function isLocalPickupAsk(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  if (PICKUP_NOT_LOCAL.some((re) => re.test(raw)) && !/\bmain\s*propre\b/i.test(raw)) {
    return false;
  }
  return PICKUP_ASK.some((re) => re.test(raw));
}

export function isInvoiceAsk(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  return INVOICE_ASK.some((re) => re.test(raw));
}

export function isRepairListing(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  // "Pièce détachée" / Grade A / Générique = spare part sold working, not as-is.
  if (
    /\bpour\s+pi[eè]ces?\b/i.test(raw) === false &&
    /\bpour\s+r[ée]paration\b/i.test(raw) === false &&
    /\bbootloop\b/i.test(raw) === false &&
    /\bred[ée]marre\s+en\s+boucle\b/i.test(raw) === false &&
    /\b[ée]cran\s+(lcd\s+)?cass/i.test(raw) === false &&
    (/\bpi[eè]ce\s+d[ée]tach/i.test(raw) ||
      /\bgrade\s*[ab]\b/i.test(raw) ||
      /\bg[ée]n[ée]rique\b/i.test(raw))
  ) {
    return false;
  }
  return REPAIR_LISTING.some((re) => re.test(raw));
}

const OEM_GENERIC_ASK: RegExp[] = [
  /\bg[ée]n[ée]rique\b/i,
  /\bgeneric\b/i,
  /\boem\b/i,
  /\bofficiel(?:le)?(?:\s+apple)?\b/i,
  /\boriginal(?:e)?\s+apple\b/i,
  /\bapple\s+original(?:e)?\b/i,
  /\bpi[eè]ce\s+originale?\b/i,
  /\b(un|une)\s+original(?:e)?\b/i,
  /\bpas\s+(un\s+)?(?:produit\s+)?(?:officiel|original)/i,
];

export function isOemGenericAsk(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  return OEM_GENERIC_ASK.some((re) => re.test(raw));
}

/** Aftermarket spare (not original Apple), still sold as a working part. */
export function listingIsAftermarketPart(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  if (/\bg[ée]n[ée]rique\b/i.test(raw) || /\bgeneric\b/i.test(raw)) return true;
  return (
    /\b(pi[eè]ce\s+)?compatible\b/i.test(raw) &&
    /\b([ée]cran|lcd|batterie|carte|clavier|topcase|trackpad|macbook)\b/i.test(raw)
  );
}

export function listingIsGradeA(text: string | undefined): boolean {
  return /\bgrade\s*a\b/i.test((text ?? "").replace(/\s+/g, " "));
}

export function formatPickupRefuse(input: {
  languageCode?: string;
  signature?: string;
}): string {
  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  const body =
    input.languageCode === "en"
      ? "Sorry, no local pickup — shipping only."
      : "Désolé, pas de retrait / main propre, uniquement envoi.";
  return input.languageCode === "en"
    ? `Hi,\n\n${body}\n\n${sig}`
    : `Bonjour,\n\n${body}\n\n${sig}`;
}

/** Fact line for the model when the listing is sold as-is / for parts. */
export function repairListingFactLine(listingText: string | undefined): string | undefined {
  if (!isRepairListing(listingText)) return undefined;
  return "Vendu pour réparation / pièces (titre). On ne teste pas toutes les fonctions (tactile, USB, batterie, bootloader, etc.). Utilise le titre (RAM/stockage/défaut s'ils y sont). Dis-le simplement, sans ton administratif.";
}

function listingBlob(listingText: string | undefined): string {
  return (listingText ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Grade A / Générique spare parts work. Never hedge with "we don't test".
 * Call when the listing is NOT for-repair, especially on origin/grade asks.
 */
export function workingPartFactLine(
  listingText: string | undefined,
  currentAsk?: string,
): string | undefined {
  if (isRepairListing(listingText)) return undefined;
  const blob = listingBlob(listingText);
  const ask = (currentAsk ?? "").replace(/\s+/g, " ").trim();
  const originAsk = isOemGenericAsk(ask) || /\bgrade\s*[ab]\b/i.test(ask);
  const functionAsk =
    /\b(fonctionn|marche|garant)\b/i.test(ask) ||
    /si .{0,50}ne (marche|fonctionne)/i.test(ask);
  if (!originAsk && !functionAsk) return undefined;

  const aftermarket = listingIsAftermarketPart(blob);
  const gradeA = listingIsGradeA(blob);
  const bits: string[] = [];
  if (aftermarket) {
    bits.push(
      "Générique / compatible = pas une pièce originale Apple (pas OEM). Très bonne qualité, ça marche. Ce n'est PAS un état d'usure ni un appareil d'occasion.",
    );
  }
  if (gradeA) {
    bits.push(
      "Grade A = excellent état cosmétique de la pièce, fonctionnelle. INTERDIT d'expliquer ça comme « signes d'usure minimes » sur un appareil.",
    );
  }
  bits.push(
    "INTERDIT : « on ne teste pas toutes les fonctions », « je ne peux pas garantir le fonctionnement » — l'annonce la vend comme ça marche. Ça fait fuir les acheteurs.",
  );
  return bits.join(" ");
}

const COLOR_MISMATCH =
  /couleur ne correspond|il me fallait .{0,60}(gris|argent)|et non (un |une )?(gris|argent)|pensais .{0,80}(achet|command).{0,40}(gris|argent)|gris sid[eé]ral.{0,40}(argent|silver)|(argent[ée]|silver).{0,40}gris/i;

export function isColorPreferenceReturn(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  const received = /(re[cç]u|arriv|livr[ée])/i.test(raw);
  const wantsReturn = /(retourn|renvoyer|renvoi|bordereau)/i.test(raw);
  return COLOR_MISMATCH.test(raw) && (received || wantsReturn);
}

export function listingColorLabel(title: string | undefined): string | undefined {
  const raw = title?.trim() ?? "";
  if (/\bargent[ée]?\b/i.test(raw) || /\bsilver\b/i.test(raw)) return "Argenté";
  if (/\bgris\s*sid[eé]ral\b/i.test(raw) || /\bspace\s*gr[ae]y\b/i.test(raw)) {
    return "gris sidéral";
  }
  if (/\bgris\b/i.test(raw)) return "gris";
  return undefined;
}

/** Wrong color vs listing — buyer pays return, no prepaid label. */
export function formatColorPreferenceRefuse(input: {
  languageCode?: string;
  signature?: string;
  listingColor?: string;
}): string {
  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  const color = input.listingColor?.trim();
  if (input.languageCode === "en") {
    const named = color ? ` as “${color}”` : "";
    return `Hi,\n\nThe colour is stated in the title${named}, so the item matches the listing. A return for colour preference (not an error on our side) is at your expense — we don't send a prepaid label. You can open the return on eBay.\n\n${sig}`;
  }
  const named = color ? ` (« ${color} »)` : "";
  return `Bonjour,\nLa couleur est indiquée dans le titre${named} : l'article reçu correspond à l'annonce.\nRetour pour préférence de couleur (pas une erreur de notre part) : frais à votre charge, pas de bordereau prépayé. Vous pouvez ouvrir le retour depuis eBay.\n\n${sig}`;
}

/** Physical return address — only when the buyer explicitly asks for it. */
export const SELLER_RETURN_ADDRESS = "7 square Stalingrad 13001 Marseille";

const RETURN_ADDRESS_ASK: RegExp[] = [
  /\badresse\s+(de\s+)?retour\b/i,
  /\badresse\s+(pour\s+)?(le\s+)?(renvoi|retour|renvoyer|exp[ée]dier)\b/i,
  /\b(votre|vos)\s+adresse\b/i,
  /\badresse\s+postale\b/i,
  /\bo[uù]\s+(vous\s+)?(renvoyer|envoyer|exp[ée]dier|retourner)\b/i,
  /\bo[uù]\s+(faut[- ]il|dois[- ]je|je\s+(dois|peux))\s+(le\s+|la\s+|l['’]\s*)?(renvoyer|envoyer|exp[ée]dier|retourner)\b/i,
  /\bwhere\s+(do\s+i|to)\s+(send|ship|return)\b/i,
  /\breturn\s+address\b/i,
  /\bshipping\s+address\s+for\s+(the\s+)?return\b/i,
];

/** Buyer explicitly asks where / which address to send the return to. */
export function isReturnAddressAsk(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  return RETURN_ADDRESS_ASK.some((re) => re.test(raw));
}

export function formatReturnAddressReply(input: {
  languageCode?: string;
  signature?: string;
}): string {
  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  if (input.languageCode === "en") {
    return `Hi,\n\nYou can send it back to: ${SELLER_RETURN_ADDRESS}.\n\n${sig}`;
  }
  return `Bonjour,\n\nVous pouvez renvoyer à : ${SELLER_RETURN_ADDRESS}.\n\n${sig}`;
}

/** Draft still has a template hole — never send to a buyer. */
export function replyHasPlaceholder(text: string | undefined): boolean {
  const raw = text ?? "";
  if (!raw.trim()) return false;
  if (/\[[^\]]{2,80}\]/i.test(raw)) return true;
  if (/\{\{[^}]{1,80}\}\}/.test(raw)) return true;
  if (/\b(à|a)\s+ins[ée]rer(\s+ici)?\b/i.test(raw)) return true;
  if (/\b(à|a)\s+compl[ée]ter\b/i.test(raw)) return true;
  if (/\bTODO\b|\bTBD\b|\bFIXME\b/.test(raw)) return true;
  if (/_{3,}/.test(raw)) return true;
  return false;
}

/** Reply leaks our return address when the buyer did not ask for it. */
export function replyLeaksReturnAddress(input: {
  reply: string | undefined;
  ask: string | undefined;
}): boolean {
  const reply = (input.reply ?? "").toLowerCase();
  if (!reply.includes("stalingrad") && !reply.includes("13001")) return false;
  return !isReturnAddressAsk(input.ask);
}
