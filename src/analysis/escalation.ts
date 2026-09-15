export type EscalationReason =
  | "photo_request"
  | "video_request"
  | "call_request"
  | "off_platform_payment"
  | "personal_data"
  | "legal_threat"
  | "complex_dispute";

export type EscalationDecision = {
  needsSellerIntervention: boolean;
  reason?: EscalationReason;
  reasonLabel?: string;
};

const RULES: Array<{
  reason: EscalationReason;
  label: string;
  patterns: RegExp[];
}> = [
  {
    reason: "photo_request",
    label: "Demande de photos / images",
    // Buyer asking the *seller* for photos — not "voici les photos" (handled in sellerCase).
    patterns: [
      /\benvoie[rz]?\s+(une\s+|des\s+)?photos?/i,
      /\bmontre[rz]?\s+(une\s+|des\s+)?photos?/i,
      /\bpeux[- ]tu\s+(m['’])?envoyer\s+(une\s+|des\s+)?photos?/i,
      /\bpouvez[- ]vous\s+(m['’])?envoyer\s+(une\s+|des\s+)?photos?/i,
      /\b(m['’]|me\s+)envoyer\s+(une\s+|des\s+)?(photos?|images?|pictures?)\b/i,
      /\b(send|sending)\s+(me\s+)?(a\s+|some\s+|more\s+)?(photos?|pictures?|images?)\b/i,
      /\bcan\s+you\s+(send|show)\s+(me\s+)?(a\s+|some\s+)?(photos?|pictures?)\b/i,
      /\b(avoir|avoir\s+davantage\s+de|plus\s+de)\s+(des\s+)?photos?\b/i,
      /\bdavantage\s+de\s+photos?\b/i,
      /\bscreenshots?\b/i,
      /\bcaptures?\s+d['’]?[ée]cran\b/i,
      /\b(des\s+)?photos?\s+(de\s+l['’]annonce|du\s+produit|de\s+l['’]article)\b/i,
    ],
  },
  {
    reason: "video_request",
    label: "Demande de vidéo",
    patterns: [/\bvid[eé]os?\b/i, /\bvideo\b/i],
  },
  {
    reason: "call_request",
    label: "Demande d’appel / téléphone",
    patterns: [
      /\bt[eé]l[eé]phone\b/i,
      /\bappel(er)?\b/i,
      /\bwhats?app\b/i,
      /\bnum[eé]ro\b/i,
      /\bphone\s*number\b/i,
      /\bcall\s+me\b/i,
    ],
  },
  {
    reason: "personal_data",
    label: "Données personnelles demandées",
    patterns: [
      /\badresse\s+(mail|e-?mail|postale|compl[eè]te)\b/i,
      /\bemail\s+perso\b/i,
      /\biban\b/i,
      /\bpassport\b/i,
      /\bpi[eè]ce\s+d['’]?identit/i,
    ],
  },
  {
    reason: "legal_threat",
    label: "Menace / plainte / avocat",
    patterns: [
      /\bavocat\b/i,
      /\bplainte\b/i,
      /\btribunal\b/i,
      /\blegal\b/i,
      /\blawsuit\b/i,
      /\bpolice\b/i,
    ],
  },
  {
    reason: "complex_dispute",
    label: "Litige / ouverture de litige eBay",
    patterns: [
      /\blitige\b/i,
      /\bdispute\b/i,
      /\bcase\s+ouvert/i,
      /\bprotection\s+achat\b/i,
      /\bbuyer\s+protection\b/i,
    ],
  },
];

/** Mentions PayPal / virement without asking to pay outside eBay. */
const OFF_PLATFORM_MENTION_ONLY: RegExp[] = [
  /\b(j['’]ai|je\s+vais|on\s+a)\s+contact[eé]/i,
  /\bcontact[eé]\s+(ebay|paypal|pay\s*pal)/i,
  /\b(ebay|paypal|pay\s*pal)\s+(et|&)\s+(ebay|paypal|pay\s*pal)/i,
  /\b(ouvert|ouvrir|ouvert)\s+(un\s+)?(litige|dispute|cas)\b/i,
  /\blitige\b/i,
  /\bdispute\b/i,
  /\br[ée]clamation\b/i,
  /\brembours/i,
  /\brefund\b/i,
  /\bprotection\s+achat\b/i,
];

/** Clear ask to move money off eBay. */
const OFF_PLATFORM_PAYMENT_ASK: RegExp[] = [
  /\b(payer|payez|paiement|r[eé]gler|virez|virer|envoyer)\b.{0,40}\b(paypal|pay\s*pal|virement|western\s+union|hors\s+ebay)\b/i,
  /\b(paypal|pay\s*pal|virement|western\s+union)\b.{0,40}\b(payer|payez|paiement|r[eé]gler|argent|money)\b/i,
  /\bhors\s+ebay\b/i,
  /\boutside\s+ebay\b/i,
  /\bwestern\s+union\b/i,
  /\bamis\s+et\s+famille\b/i,
  /\bfriends\s+and\s+family\b/i,
  /\b(donner|donne[rz]|votre)\s+(paypal|pay\s*pal)\b/i,
  /\b(paypal|pay\s*pal)\s*(s['’]il\s+vous|svp)\b/i,
  /\bcartes?\s+bancaires?\b/i,
  /\bcoordonn[eé]es\s+bancaires\b/i,
  /\brib\b/i,
];

function isOffPlatformPaymentAsk(text: string): boolean {
  if (!OFF_PLATFORM_PAYMENT_ASK.some((re) => re.test(text))) {
    return false;
  }
  // "j'ai contacté ebay et paypal" / litige / remboursement → pas une demande de paiement.
  if (OFF_PLATFORM_MENTION_ONLY.some((re) => re.test(text))) {
    // Still escalate if they clearly ask to pay off-platform in the same message.
    const asksPay =
      /\b(payer|payez|paiement|virez|virer|envoyer\s+l['’]?argent)\b/i.test(
        text,
      ) &&
      /\b(paypal|pay\s*pal|virement|hors\s+ebay|western)\b/i.test(text) &&
      !/\b(j['’]ai\s+contact|contact[eé]|litige|dispute|rembours)/i.test(text);
    return asksPay;
  }
  return true;
}

/**
 * Detect buyer requests the AI must NOT answer alone.
 * Pure heuristics — no LLM.
 */
export function detectEscalation(
  text: string | undefined,
): EscalationDecision {
  const raw = text?.trim() ?? "";
  if (!raw) return { needsSellerIntervention: false };

  if (isOffPlatformPaymentAsk(raw)) {
    return {
      needsSellerIntervention: true,
      reason: "off_platform_payment",
      reasonLabel: "Paiement hors eBay",
    };
  }

  for (const rule of RULES) {
    if (rule.patterns.some((re) => re.test(raw))) {
      return {
        needsSellerIntervention: true,
        reason: rule.reason,
        reasonLabel: rule.label,
      };
    }
  }

  return { needsSellerIntervention: false };
}
