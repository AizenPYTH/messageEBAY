import { isFromSelf } from "../conversations/messageSides.js";
import type { EbayMessage } from "../ebay/messageApi.js";
import { detectEscalation, type EscalationReason } from "./escalation.js";
import { isInvoiceAsk, isLocalPickupAsk, isColorPreferenceReturn, isReturnAddressAsk } from "./sellerOps.js";

/** Price (EUR-equivalent) above which we may auto-offer a ~10% gesture. */
export const PARTIAL_REFUND_MIN_PRICE = 50;

export type SellerCaseKind =
  | EscalationReason
  | "return_label_request"
  | "refund_or_return_request"
  | "partial_refund_offer"
  | "partial_refund_refused"
  | "damaged_item_manual"
  | "exterior_packaging_damage"
  | "buyer_photos_received"
  | "wrong_address_or_cancel"
  | "inbound_sell_offer"
  | "buyer_return_shipped"
  | "invoice_request"
  | "local_pickup"
  | "color_preference_return"
  | "return_address_ask"
  | "none";

export type SellerCaseDecision = {
  kind: SellerCaseKind;
  /** Human report line, e.g. "Cet acheteur demande des photos (à traiter)". */
  summaryFr: string;
  needsSellerIntervention: boolean;
  /** Deterministic reply the pipeline may send (no LLM). */
  autoReplyKind?:
    | "partial_refund_10"
    | "ask_packaging_photos"
    | "wrong_address_cancel"
    | "refuse_pickup"
    | "color_preference_return"
    | "return_address";
};

const RETURN_LABEL_PATTERNS: RegExp[] = [
  /\bbordereau\b/i,
  /\bbon\s+(de\s+)?retour\b/i,
  /\bbons?\s+de\s+retour\b/i,
  /\b[ée]tiquettes?\s+(de\s+)?retour\b/i,
  /\blabel\s+(de\s+)?retour\b/i,
  /\breturn\s+label\b/i,
  /\bprepaid\s+return\b/i,
  /\benvoi(ez|er)?\s+(un\s+)?bordereau\b/i,
  /\bfournir\s+(un\s+)?bordereau\b/i,
  /\benvoy(er|ez)\s+(un\s+)?(bordereau|bon\s+(de\s+)?retour)\b/i,
  /\bm['’]?envoyer\s+(un\s+)?(bordereau|bon\s+(de\s+)?retour)\b/i,
];

/** Buyer asks for a refund / money back — never auto-promise, alert seller. */
const REFUND_ASK_PATTERNS: RegExp[] = [
  /\brembours/i,
  /\brefund\b/i,
  /\brendre\s+(l['’]?argent|mon\s+argent)\b/i,
  /\breprendre\s+(mon\s+)?argent\b/i,
  /\bgeste\s+commercial\b/i,
  /\bje\s+veux\s+(un\s+)?retour\b/i,
  /\bje\s+souhaite\s+(un\s+)?retour\b/i,
  /\bfaire\s+un\s+retour\b/i,
  /\bretourn(er|ez|é|ée|és)?\b/i,
  /\brenvoy(er|ez|é|ée|és)?\b/i,
  /\bpui[sx][- ]je\s+retourn/i,
  /\bpuis[- ]je\s+retourn/i,
  /\bcan\s+i\s+return\b/i,
  /\breturn\s+(the\s+)?(item|product|order|it)\b/i,
  /\bi\s+want\s+(a\s+)?(refund|return)\b/i,
  /\bsi\s+.{0,80}\bretourn/i,
];

/** Buyer already shipped a return (tracking / “envoyé ce jour”) — never answer stock. */
const CARRIER_TRACKING_RE =
  /\b[A-Z]{2}\d{8,12}[A-Z]{2}\b/i;

export function isBuyerReturnShipped(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;

  const hasReturn = /\b(retour|return)\b/i.test(raw);
  const hasSent =
    /\b(envoy[ée]e?s?|envoyez|exp[ée]di[ée]e?s?|envoi[ée]?|sent|shipped)\b/i.test(
      raw,
    );
  const sentToday = /\b(ce jour|aujourd['’]?hui|today)\b/i.test(raw);
  const hasTracking =
    CARRIER_TRACKING_RE.test(raw) ||
    /\b(n[°o]|suivi|tracking)\s*[:.]?\s*[A-Z0-9]{10,}\b/i.test(raw);
  const iSent = /\bj['’]?\s*ai\s+envoy/i.test(raw);
  const askingWhere =
    /\bo[uù]\s+est\b/i.test(raw) ||
    /\bwhere\s+is\b/i.test(raw) ||
    /\bpas\s+re[cç]u\b/i.test(raw);

  if (hasReturn && (hasSent || sentToday || hasTracking || iSent)) return true;
  if (iSent && (hasReturn || hasTracking || sentToday)) return true;
  // Buyer pastes a carrier ID as “I sent it” — not “where is my order?”.
  if (hasTracking && (hasSent || sentToday || iSent) && !askingWhere) {
    return true;
  }
  return false;
}

/**
 * Short “envoyez ce jour” without a question — not a stock ask.
 * With return context → handled by isBuyerReturnShipped; else shipping delay only.
 */
export function isShipTodayPhrase(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw || raw.includes("?")) return false;
  if (raw.length > 80) return false;
  const n = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  return /\b(envoyez|envoye|expediez)\s+(ce jour|aujourdhui)\b/.test(n);
}

/** Damage / defect words (not enough alone — need post-purchase context). */
const DAMAGE_WORDS: RegExp[] = [
  /cass[ée]e?s?/i,
  /endommag/i,
  /d[ée]fectueux/i,
  /ne\s+fonctionne\s+pas/i,
  /\bhs\b/i,
  /\bbroken\b/i,
  /\bdamaged\b/i,
  /not\s+working/i,
  /ab[iî]m[ée]e?s?/i,
  /trou[ée]e?s?/i,
  /[ée]cras[ée]e?s?/i,
  /flexgate/i,
  /s['’][ée]teint/i,
  /\b[ée]teint\b/i,
];

/**
 * Buyer claims the *ordered / received* item is bad.
 * Pre-sale questions ("mon mac est cassé", "s'allume pas", compat) must NOT match.
 */
const POST_PURCHASE_DAMAGE: RegExp[] = [
  /re[cç]u.{0,50}(cass|endommag|d[ée]fect|hs|broken|damaged|ab[iî]m)/i,
  /(cass|endommag|d[ée]fect|hs|broken|damaged|ab[iî]m).{0,50}re[cç]u/i,
  /arriv[ée].{0,50}(cass|endommag|d[ée]fect|hs|broken|ab[iî]m)/i,
  /(cass|endommag|d[ée]fect|ab[iî]m).{0,40}arriv/i,
  /\b(livr[ée]|colis|commande).{0,60}(cass|endommag|d[ée]fect|ne\s+fonctionne|hs|broken|ab[iî]m)/i,
  /\bdead\s+on\s+arrival\b/i,
  /\bdoa\b/i,
  /\bà\s+l['’]ouverture\b.{0,40}(cass|endommag|d[ée]fect|hs)/i,
  /\bj['’]ai\s+re[cç]u\b.{0,80}(ne\s+fonctionne|cass|endommag|d[ée]fect|hs|ab[iî]m)/i,
  /\barticle\s+re[cç]u\b.{0,60}(cass|endommag|d[ée]fect|hs|ab[iî]m)/i,
  /re[cç]u.{0,220}(flexgate|s['’][ée]teint|[ée]teint|probl[eè]me)/i,
  /flexgate.{0,80}re[cç]u/i,
];

/** Exterior packaging / carton damaged — ask photos, don't jump to return/litige. */
const EXTERIOR_PACKAGING_DAMAGE: RegExp[] = [
  /\b(emballage|carton|bo[iî]te|packaging|box)\b.{0,50}(cass|ab[iî]m|endommag|trou[ée]|[ée]cras|ouvert|d[ée]chir|damaged|broken)/i,
  /(cass|ab[iî]m|endommag|trou[ée]|[ée]cras|ouvert|d[ée]chir|damaged|broken).{0,50}\b(emballage|carton|bo[iî]te|packaging|box)\b/i,
  /\bcolis\b.{0,40}(ab[iî]m|endommag|trou[ée]|[ée]cras|d[ée]chir)/i,
  /\b(à|a)\s+l['’]?ext[ée]rieur\b.{0,40}(cass|ab[iî]m|endommag|trou|damaged)/i,
  /(cass|ab[iî]m|endommag|trou|damaged).{0,40}\b(ext[ée]rieur|outside|outer)\b/i,
  /\bext[ée]rieur(ement)?\s+(cass|ab[iî]m|endommag)/i,
  /\bouter\s+(box|packaging)\b.{0,30}(damaged|broken|crushed)/i,
];

/** Buyer is sending / attaching photos (not asking the seller for listing photos). */
const BUYER_SENDING_PHOTOS: RegExp[] = [
  /\b(voici|ci[- ]joints?|ci[- ]jointes?)\b.{0,40}\b(photos?|images?|pictures?)\b/i,
  /\b(photos?|images?|pictures?)\b.{0,40}\b(voici|ci[- ]joints?|ci[- ]jointes?|jointes?|envoy)/i,
  /\bj['’]ai\s+(pris|envoy[ée]e?s?|mis|ajout[ée]e?s?|joint)\s+(des\s+)?(photos?|images?)\b/i,
  /\b(photo|image|picture)s?\s+(envoy[ée]e?s?|jointes?|attach)/i,
  /\b(see|here\s+are|attached|sending)\s+(the\s+)?(photos?|pictures?|images?)\b/i,
  /\bi\s+(sent|attached|took)\s+(some\s+|the\s+)?(photos?|pictures?)\b/i,
];

/** Buyer wants shipping address changed and/or order cancelled. */
const WRONG_ADDRESS_PATTERNS: RegExp[] = [
  /\btromp[ée]e?\s+d['’]?adress/i,
  /\bmauvaise\s+adress/i,
  /\berreur\s+d['’]?adress/i,
  /\badress[e]?\s+(erron|fausse|incorrect)/i,
  /\b(changer|change[rz]?|modifi(er|ez)|corriger)\s+(l['’]|la\s+|mon\s+|ma\s+)?adress/i,
  /\b(l['’]|la\s+)?adress[e]?.{0,40}\b(changer|modifi|corriger|tromp|erron|fausse|mauvaise)\b/i,
  /\bwrong\s+address\b/i,
  /\bchange\s+(the\s+|my\s+)?(shipping\s+)?address\b/i,
  /\bincorrect\s+address\b/i,
];

const CANCEL_ORDER_PATTERNS: RegExp[] = [
  /\bannul(er|ez|ation)\b.{0,40}\b(commande|achat|order)\b/i,
  /\b(commande|achat|order)\b.{0,40}\bannul/i,
  /\bcancel\s+(the\s+|my\s+)?(order|purchase)\b/i,
  /\b(order|purchase)\b.{0,30}\bcancel/i,
  /\bou\s+j['’]annule\b/i,
  /\bdois[- ]je\s+annul/i,
  /\bfaut[- ]il\s+(que\s+j['’]?|que\s+je\s+)?annul/i,
  /\bje\s+(dois|peux|vais)\s+annul/i,
];

export function isWrongAddressAsk(text: string): boolean {
  return WRONG_ADDRESS_PATTERNS.some((re) => re.test(text));
}

export function isCancelOrderAsk(text: string): boolean {
  return CANCEL_ORDER_PATTERNS.some((re) => re.test(text));
}

const PRIOR_PARTIAL_OFFER_PATTERNS: RegExp[] = [
  /\b10\s*%\b/,
  /\b10\s*pour\s*cent\b/i,
  /\bgeste\s+commercial\b/i,
  /\bremboursement\s+partiel\b/i,
  /\bremise\s+de\s+10\b/i,
  /\bpartial\s+refund\b/i,
  /\b10\s*%\s+(discount|off|refund)\b/i,
];

const REFUSE_PATTERNS: RegExp[] = [
  /\bnon\b/i,
  /\brefus/i,
  /\bje\s+veux\s+(un\s+)?retour\b/i,
  /\bremboursement\s+(int[ée]gral|complet|total|à\s+100)\b/i,
  /\bfull\s+refund\b/i,
  /\b100\s*%\b/,
  /\bpas\s+d['’]?accord\b/i,
  /\bje\s+pr[eé]f[eè]re\s+(un\s+)?retour\b/i,
];

const CASE_SUMMARIES: Record<Exclude<SellerCaseKind, "none">, string> = {
  photo_request: "Cet acheteur demande des photos (à traiter)",
  video_request: "Cet acheteur demande une vidéo (à traiter)",
  call_request: "Cet acheteur demande un appel / téléphone (à traiter)",
  off_platform_payment: "Cet acheteur parle d’un paiement hors eBay (à traiter)",
  personal_data: "Cet acheteur demande des données personnelles (à traiter)",
  legal_threat: "Cet acheteur parle de plainte / avocat (à traiter)",
  complex_dispute: "Cet acheteur ouvre / parle d’un litige (à traiter)",
  return_label_request: "Cet acheteur demande un bordereau / bon de retour (à traiter)",
  refund_or_return_request:
    "Cet acheteur demande un remboursement / retour (à traiter — pas de promesse auto)",
  partial_refund_offer:
    "Négociation remboursement partiel (~10 %) proposée à cet acheteur",
  partial_refund_refused:
    "Cet acheteur refuse le geste et veut un retour / bordereau (à traiter)",
  damaged_item_manual:
    "Article reçu défectueux / flexgate / SAV — à traiter, pas de diagnostic auto",
  exterior_packaging_damage:
    "Emballage abîmé à l’extérieur — photos demandées à l’acheteur",
  buyer_photos_received:
    "Cet acheteur a envoyé des photos (à traiter / vérifier)",
  wrong_address_or_cancel:
    "Adresse erronée / demande d’annulation commande (à traiter)",
  inbound_sell_offer:
    "Cette personne veut nous vendre un lot (pas une question sur l’annonce) — ne pas répondre auto",
  buyer_return_shipped:
    "Cet acheteur a envoyé le retour (suivi) — à traiter, ne pas parler de stock / expédition",
  invoice_request:
    "Cet acheteur demande une facture — à traiter à la main, ne rien promettre",
  local_pickup:
    "Demande de retrait / main propre — refus auto (envoi seulement)",
  color_preference_return:
    "Retour couleur (annonce claire) — frais acheteur, pas de bordereau prépayé",
  return_address_ask:
    "Adresse de retour demandée — réponse auto (7 square Stalingrad)",
};

export function parseListingPrice(price?: string | null): number | undefined {
  if (!price?.trim()) return undefined;
  const normalized = price
    .trim()
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const n = Number.parseFloat(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function mentionsReturnLabel(text: string): boolean {
  return RETURN_LABEL_PATTERNS.some((re) => re.test(text));
}

/**
 * Someone trying to sell TO us (wholesale / lot), not a buyer of our listing.
 * Never auto-negotiate these.
 */
export function isInboundSellOffer(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return false;

  const strong: RegExp[] = [
    /\bi currently have\b.{0,120}\b(for sale|to sell)\b/i,
    /\bi have .{0,80}\b(for sale|to sell)\b/i,
    /\b(modules?|lots?|units?)\b.{0,80}\bfor sale\b/i,
    /\bfor sale\b.{0,80}\b(interested|lot includes|make me an offer)\b/i,
    /\bthe lot includes\b/i,
    /\ble lot (comprend|inclut)\b/i,
    /\bje vends\b/i,
    /\bj['’]ai .{0,80}\b(à vendre|a vendre)\b/i,
    /\b(article|lot|stock)\b.{0,40}\bà vendre\b/i,
    /\bwanted to (check|see) if you (might be|are) interested\b/i,
    /\bcheck if you might be interested\b/i,
    /\bmake me an offer for the (entire )?lot\b/i,
    /\bmy price for all\b/i,
    /\bprix pour (tout|le lot|l['’]ensemble)\b/i,
    /\bwould you (like|want) to buy\b/i,
    /\bsouhaite[rz]? (me )?racheter\b/i,
    /\bsi vous [eê]tes int[eé]ress[eé].{0,60}\b(lot|offre|vendre)\b/i,
  ];
  if (strong.some((re) => re.test(raw))) return true;

  const selling = /\b(for sale|to sell|à vendre|a vendre|je vends)\b/i.test(raw);
  const lot =
    /\b(lot includes|entire lot|units of|32 units|modules for sale)\b/i.test(
      raw,
    );
  const askInterest =
    /\b(if you('re| are) interested|int[eé]ress[eé]|make me an offer)\b/i.test(
      raw,
    );
  return selling && (lot || askInterest);
}

function mentionsRefundOrReturn(text: string): boolean {
  return REFUND_ASK_PATTERNS.some((re) => re.test(text));
}

export function isExteriorPackagingDamage(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  return EXTERIOR_PACKAGING_DAMAGE.some((re) => re.test(raw));
}

export function buyerSentPhotos(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  return BUYER_SENDING_PHOTOS.some((re) => re.test(raw));
}

/** True only for post-purchase "I received a bad item" claims. */
export function isPostPurchaseDamageClaim(text: string): boolean {
  const raw = text.trim();
  if (!raw) return false;
  // Packaging-only claims are handled separately (ask photos first).
  if (isExteriorPackagingDamage(raw) && !/\b(int[ée]rieur|inside|produit|article)\b.{0,30}(cass|ab[iî]m|endommag|hs|broken)/i.test(raw)) {
    // Pure exterior → not interior product claim for 10% / manual damage path
    if (!/\b(ne\s+fonctionne|d[ée]fectueux|hs|dead\s+on\s+arrival|doa)\b/i.test(raw)) {
      return false;
    }
  }
  if (POST_PURCHASE_DAMAGE.some((re) => re.test(raw))) return true;
  const hasDamage = DAMAGE_WORDS.some((re) => re.test(raw));
  const hasReceipt =
    /\b(re[cç]u|livr[ée]|arriv[ée]|commande|colis|doa)\b/i.test(raw);
  if (!hasDamage || !hasReceipt) return false;
  if (
    /\b(mon|ma|mes)\s+(mac|pc|ordinateur|iphone|appareil|machine)\b/i.test(
      raw,
    ) &&
    !/\bj['’]ai\s+re[cç]u\b/i.test(raw)
  ) {
    return false;
  }
  if (
    /\b(compatible|pas\s+pu\s+tester|avant\s+d['’]?acheter|est[- ]ce\s+que)\b/i.test(
      raw,
    ) &&
    !hasReceipt
  ) {
    return false;
  }
  return true;
}

function sellerAlreadyOfferedPartial(
  messages: EbayMessage[],
  sellerUsername?: string,
): boolean {
  for (const message of messages) {
    if (
      !isFromSelf({
        senderUsername: message.senderUsername,
        selfUsername: sellerUsername,
      })
    ) {
      continue;
    }
    const body = message.messageBody ?? "";
    if (PRIOR_PARTIAL_OFFER_PATTERNS.some((re) => re.test(body))) {
      return true;
    }
  }
  return false;
}

function isAfterSalesFollowUp(text: string): boolean {
  return /(probl[eè]me persist|quelle solution|r[ée]gler (ce |se )?probl[eè]me|malgr[eé] tout|apr[eè]s v[ée]rification|tout est en ordre)/i.test(
    text,
  );
}

function buyerRefusesOrWantsReturn(text: string): boolean {
  return (
    REFUSE_PATTERNS.some((re) => re.test(text)) || mentionsReturnLabel(text)
  );
}

/**
 * Classify what the seller should see in Rapports, and whether the bot
 * may reply at all. Never invents risky promises — only a fixed 10% offer
 * on expensive *received* damaged items (not pre-sale questions).
 */
export function classifySellerCase(input: {
  latestText?: string | null;
  messages?: EbayMessage[];
  sellerUsername?: string;
  listingPrice?: string | null;
}): SellerCaseDecision {
  const text = input.latestText?.trim() ?? "";
  if (!text) {
    return { kind: "none", summaryFr: "", needsSellerIntervention: false };
  }

  const messages = input.messages ?? [];
  const buyerHistory = messages
    .filter(
      (m) =>
        !isFromSelf({
          senderUsername: m.senderUsername,
          selfUsername: input.sellerUsername,
        }),
    )
    .map((m) => m.messageBody ?? "")
    .join("\n");

  // Someone selling TO us — never negotiate, never quote our listing price.
  if (isInboundSellOffer(text) || isInboundSellOffer(buyerHistory)) {
    return {
      kind: "inbound_sell_offer",
      summaryFr: CASE_SUMMARIES.inbound_sell_offer,
      needsSellerIntervention: true,
    };
  }

  // Buyer already sent the return (tracking) — never answer stock / “je n'expédie pas”.
  if (isBuyerReturnShipped(text) || isBuyerReturnShipped(buyerHistory)) {
    return {
      kind: "buyer_return_shipped",
      summaryFr: CASE_SUMMARIES.buyer_return_shipped,
      needsSellerIntervention: true,
    };
  }

  // Facture / TVA — seller sends it, auto must not promise anything.
  if (isInvoiceAsk(text)) {
    return {
      kind: "invoice_request",
      summaryFr: CASE_SUMMARIES.invoice_request,
      needsSellerIntervention: true,
    };
  }

  // Main propre / récupérer sur place — always refuse, shipping only.
  if (isLocalPickupAsk(text)) {
    return {
      kind: "local_pickup",
      summaryFr: CASE_SUMMARIES.local_pickup,
      needsSellerIntervention: false,
      autoReplyKind: "refuse_pickup",
    };
  }

  // Received the listed colour, wanted another — not our error, no prepaid label.
  if (isColorPreferenceReturn(text)) {
    return {
      kind: "color_preference_return",
      summaryFr: CASE_SUMMARIES.color_preference_return,
      needsSellerIntervention: false,
      autoReplyKind: "color_preference_return",
    };
  }

  // Explicit "where's your address / where do I send it" — give the real address only then.
  if (isReturnAddressAsk(text)) {
    return {
      kind: "return_address_ask",
      summaryFr: CASE_SUMMARIES.return_address_ask,
      needsSellerIntervention: false,
      autoReplyKind: "return_address",
    };
  }

  // Buyer sent photos → always alert seller to review.
  if (buyerSentPhotos(text)) {
    return {
      kind: "buyer_photos_received",
      summaryFr: CASE_SUMMARIES.buyer_photos_received,
      needsSellerIntervention: true,
    };
  }

  // Exterior packaging damaged → ask for photos (no litige/retour).
  if (isExteriorPackagingDamage(text)) {
    return {
      kind: "exterior_packaging_damage",
      summaryFr: CASE_SUMMARIES.exterior_packaging_damage,
      needsSellerIntervention: false,
      autoReplyKind: "ask_packaging_photos",
    };
  }

  // Bordereau / bon de retour → never auto-reply, seller handles.
  if (mentionsReturnLabel(text)) {
    return {
      kind: "return_label_request",
      summaryFr: CASE_SUMMARIES.return_label_request,
      needsSellerIntervention: true,
    };
  }

  // Remboursement / je veux un retour → never promise money, alert only.
  if (mentionsRefundOrReturn(text)) {
    return {
      kind: "refund_or_return_request",
      summaryFr: CASE_SUMMARIES.refund_or_return_request,
      needsSellerIntervention: true,
    };
  }

  // Wrong address / cancel order → seller cancels (never "only eBay can cancel").
  if (isWrongAddressAsk(text) || isCancelOrderAsk(text)) {
    return {
      kind: "wrong_address_or_cancel",
      summaryFr: CASE_SUMMARIES.wrong_address_or_cancel,
      // Reply auto, then alert in Rapports so the seller can cancel.
      needsSellerIntervention: false,
      autoReplyKind: "wrong_address_cancel",
    };
  }

  const escalation = detectEscalation(text);
  if (escalation.needsSellerIntervention && escalation.reason) {
    return {
      kind: escalation.reason,
      summaryFr: CASE_SUMMARIES[escalation.reason],
      needsSellerIntervention: true,
    };
  }

  const offeredPartial = sellerAlreadyOfferedPartial(
    messages,
    input.sellerUsername,
  );

  if (
    offeredPartial &&
    (buyerRefusesOrWantsReturn(text) || mentionsReturnLabel(text))
  ) {
    return {
      kind: "partial_refund_refused",
      summaryFr: CASE_SUMMARIES.partial_refund_refused,
      needsSellerIntervention: true,
    };
  }

  // Damaged / defective received item — alert seller. Never play technician.
  if (
    isPostPurchaseDamageClaim(text) ||
    isPostPurchaseDamageClaim(buyerHistory) ||
    (isAfterSalesFollowUp(text) && isPostPurchaseDamageClaim(buyerHistory))
  ) {
    return {
      kind: "damaged_item_manual",
      summaryFr: CASE_SUMMARIES.damaged_item_manual,
      needsSellerIntervention: true,
    };
  }

  return { kind: "none", summaryFr: "", needsSellerIntervention: false };
}

export function formatPartialRefundOffer(input: {
  languageCode?: string;
  signature?: string;
}): string {
  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  const body =
    input.languageCode === "en"
      ? "Hello,\n\nSorry about this issue. I can offer a 10% commercial gesture on the purchase price.\n\nPlease let me know if that works for you."
      : "Bonjour,\n\nDésolé pour ce souci. Je vous propose un geste commercial de 10 % sur le prix d'achat.\n\nDites-moi si cela vous convient.";
  return `${body}\n\n${sig}`;
}

/** Exterior packaging damage — ask photos, no return/litige. */
export function formatAskPackagingPhotos(input: {
  languageCode?: string;
  signature?: string;
  apologize?: boolean;
}): string {
  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  const sorry =
    input.apologize !== false
      ? input.languageCode === "en"
        ? "Sorry about that. "
        : "Désolé pour ce désagrément. "
      : "";
  const body =
    input.languageCode === "en"
      ? `Hello,\n\n${sorry}Could you please send photos of the outer packaging / box (all sides if possible)? I'll check as soon as I receive them.`
      : `Bonjour,\n\n${sorry}Pouvez-vous m'envoyer des photos de l'emballage / carton à l'extérieur (plusieurs angles si possible) ? Je regarde dès réception.`;
  return `${body}\n\n${sig}`;
}

/**
 * Wrong shipping address / cancel ask.
 * Seller cancels the order themselves — never "only eBay can cancel".
 */
export function formatWrongAddressCancel(input: {
  languageCode?: string;
  signature?: string;
  mentionsAddress?: boolean;
}): string {
  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  if (input.languageCode === "en") {
    const body = input.mentionsAddress
      ? "Hello,\n\nThe shipping address can't be changed after the order, but I can cancel it myself so you can reorder with the correct address. Do you confirm the cancellation?"
      : "Hello,\n\nYes I can cancel the order myself. Do you confirm the cancellation?";
    return `${body}\n\n${sig}`;
  }
  const body = input.mentionsAddress
    ? "Bonjour,\n\nOn ne peut pas modifier l'adresse après commande, par contre je peux annuler la commande directement de mon côté pour que vous en repassiez une avec la bonne adresse. Vous confirmez l'annulation ?"
    : "Bonjour,\n\nOui je peux annuler la commande directement de mon côté. Vous confirmez l'annulation ?";
  return `${body}\n\n${sig}`;
}
