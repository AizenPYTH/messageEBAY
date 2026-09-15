import { isInvoiceAsk, isLocalPickupAsk, isRepairListing, isReturnAddressAsk, replyHasPlaceholder, replyLeaksReturnAddress } from "../analysis/sellerOps.js";
import { auctionHasBuyItNow, isAuctionListing } from "../analysis/auction.js";
import { replyDeniesUnprovenComponent } from "../analysis/contentsAsk.js";
import {
  isAboutExistingOrder,
  replyPushesOtherListing,
} from "../analysis/orderContext.js";
import { replyInvitesNegotiation } from "../analysis/priceOffer.js";
import { detectAllListingTopics } from "../analysis/listingEvidence.js";
import type { ClosedQuestionTopic } from "../analysis/types.js";
import type { ListingDetails } from "../ebay/tradingApi.js";
import type { EbayMessage } from "../ebay/messageApi.js";
import { isShippingCostAsk } from "../shipping/shippingCost.js";
import { isTrackingRequest } from "../shipping/detectTracking.js";
import { isDeliveryEtaAsk, detectDestination } from "../shipping/deliveryEta.js";
import { SAME_DAY_BEFORE_15 } from "../seller/casualPhrases.js";
import { isNearDuplicateReply } from "../autopilot/alreadyReplied.js";
import {
  extractAskedIdentity,
  identityMatchesText,
  isEmptyIdentity,
} from "../product/identity.js";
import { isAbstainReply } from "./abstain.js";

export type ReplyQualityIssue =
  | "off_topic"
  | "misses_question"
  | "duplicate"
  | "invented"
  | "too_long"
  | "answers_old_topic"
  | "model_mismatch"
  | "wrong_listing"
  | "policy_breach"
  | "robotic";

export type ReplyQualityResult = {
  ok: boolean;
  /** Block send if true even after a second draft. */
  block: boolean;
  issues: ReplyQualityIssue[];
  reasons: string[];
};

const SHIP_REPLY =
  /\b(livraison|frais\s+de\s+port|colissimo|chronopost|0[,.]0\s*(€|eur)|envoi\s+gratuit|free\s+ship)\b/i;
const RETURN_REPLY =
  /\b(retour|rembours|bordereau|refund|return\s+label)\b/i;
const PRICE_REPLY = /\b(\d+[,.]\d{2}\s*(€|eur)|prix\s+(est|de))\b/i;
const STOCK_REPLY =
  /\b(dispo|disponible|en stock|plus en stock|rupture|oui|non|encore)\b/i;
const PART_CODE =
  /\b(A\d{4}[A-Z]?|(?:SM-)?[ASNMFGJET]\d{3}[A-Z]{1,2}|820-\d{4,}-[A-Z0-9]+)\b/gi;
const ROBOT_NO_INFO =
  /je ne peux pas (fournir|confirmer)|je vous encourage|source fiable|d[ée]tails ne sont pas disponibles|n['’]h[ée]sitez pas|v[ée]rifiez les sp[ée]cifications|satisfaction est notre priorit|point d['’]honneur|nous mettons tout en [œoe]uvre|consulter un professionnel|expertise technique|nous pourrions envisager|tenir inform[ée] de l['’][ée]volution|je vous informe que nous proposons|merci pour votre compr[ée]hension/i;
const UNTESTED_HEDGE =
  /ne test(e|ons) pas (toutes )?les fonctions|je ne peux pas garantir|on ne (peut|peut\s+pas) garant|n['’]est pas n[ée]cessairement .{0,60}apple|signes d['’]usure minimes/i;
const AFFIRMS_STOCK =
  /\b(oui|en stock|dispo|disponible|voici le lien|on a|je l['’]ai|in stock|here'?s the link)\b/i;
const PICKUP_CONFIRM =
  /(r[ée]cup[ée]ration.{0,50}possible|heure qui vous convient|demain matin)/i;

function bodyWithoutSignature(reply: string): string {
  return reply
    .replace(/cordialement[\s\S]*$/i, "")
    .replace(/^\s*(bonjour|bonsoir|hello|hi)\s*,?\s*/i, "")
    .trim();
}

function describeAsk(ask: string): string {
  const identity = extractAskedIdentity(ask);
  return identity?.label.trim() || identity?.codes.join(", ") || "modèle demandé";
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function askedShipping(ask: string, topics: ClosedQuestionTopic[]): boolean {
  return (
    topics.includes("fast_shipping") ||
    isShippingCostAsk(ask) ||
    isTrackingRequest(ask)
  );
}

function askedReturns(ask: string): boolean {
  return /\b(retour|rembours|return|refund)\b/i.test(ask);
}

function askedPrice(ask: string): boolean {
  return /\b(prix|tarif|combien|how much|cher)\b/i.test(ask);
}

function askedStock(ask: string, topics: ClosedQuestionTopic[]): boolean {
  return (
    topics.includes("available") ||
    /\b(dispo|disponible|stock|avez[- ]vous|encore)\b/i.test(ask)
  );
}

function lastSellerBody(
  messages: EbayMessage[],
  selfUsernames: Array<string | undefined>,
): string | undefined {
  const self = new Set(
    selfUsernames.map((s) => s?.trim().toLowerCase()).filter(Boolean),
  );
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]!;
    const from = m.senderUsername?.trim().toLowerCase();
    if (from && self.has(from)) {
      return m.messageBody;
    }
  }
  return undefined;
}

/**
 * Cheap pre-send checks — no extra LLM.
 * Blocks invented / off-topic / duplicate replies; warns on length.
 */
export function assessReplyQuality(input: {
  reply: string;
  currentAsk: string;
  listing?: ListingDetails;
  listingFactsText?: string;
  messages?: EbayMessage[];
  selfUsernames?: Array<string | undefined>;
  maxWords?: number;
}): ReplyQualityResult {
  const issues: ReplyQualityIssue[] = [];
  const reasons: string[] = [];

  if (isAbstainReply(input.reply)) {
    return { ok: true, block: false, issues: [], reasons: [] };
  }

  const ask = input.currentAsk.replace(/\s+/g, " ").trim();
  const body = bodyWithoutSignature(input.reply);
  const listingBlob = `${input.listing?.title ?? ""}\n${input.listing?.descriptionText ?? ""}\n${input.listingFactsText ?? ""}`;
  if (!ask || !body) {
    return { ok: true, block: false, issues: [], reasons: [] };
  }

  const topics = detectAllListingTopics(ask);
  const facts = `${input.listingFactsText ?? ""}\n${input.listing?.title ?? ""}\n${input.listing?.descriptionText ?? ""}`;

  if (!askedShipping(ask, topics) && SHIP_REPLY.test(body)) {
    issues.push("off_topic");
    reasons.push("la réponse parle de livraison alors que ce n'est pas demandé");
  }
  if (!askedReturns(ask) && RETURN_REPLY.test(body)) {
    issues.push("off_topic");
    reasons.push("la réponse parle de retour/remboursement hors sujet");
  }
  if (!askedPrice(ask) && PRICE_REPLY.test(body) && !askedShipping(ask, topics)) {
    issues.push("off_topic");
    reasons.push("la réponse donne un prix non demandé");
  }

  if (
    askedStock(ask, topics) &&
    /\bannul/i.test(body) &&
    !/\bannul/i.test(ask)
  ) {
    issues.push("off_topic");
    reasons.push("la réponse parle d'annulation alors que la question est autre");
  }

  if (askedStock(ask, topics) && !STOCK_REPLY.test(body) && body.length > 20) {
    issues.push("misses_question");
    reasons.push("la question porte sur la dispo mais la réponse n'y répond pas");
  }

  const prev = lastSellerBody(input.messages ?? [], input.selfUsernames ?? []);
  if (prev && isNearDuplicateReply(prev, input.reply)) {
    issues.push("duplicate");
    reasons.push("même réponse que le message vendeur précédent");
  }

  const codes = body.match(PART_CODE) ?? [];
  for (const code of codes) {
    const hay = `${ask}\n${facts}`.toUpperCase();
    if (!hay.includes(code.toUpperCase())) {
      issues.push("invented");
      reasons.push(`référence ${code} absente des faits / de la question`);
      break;
    }
  }

  // A reply may only say "oui / en stock / voici le lien" about the model that
  // was actually asked for. Naming another one in the same breath is how an
  // iPhone link ends up answering a Samsung question. Negative or explanatory
  // sentences ("non, cette annonce c'est le A135F") stay allowed on purpose.
  const askedIdentity = extractAskedIdentity(ask);
  if (!isEmptyIdentity(askedIdentity)) {
    const sellingSentence = body
      .replace(/https?:\/\/\S+/g, " ")
      .split(/(?<=[.!?\n])\s+/)
      .find(
        (sentence) =>
          AFFIRMS_STOCK.test(sentence) &&
          identityMatchesText(askedIdentity, sentence) === "mismatch",
      );
    if (sellingSentence) {
      issues.push("model_mismatch");
      reasons.push(
        `la réponse propose un autre modèle que celui demandé (${describeAsk(ask)}) : « ${sellingSentence.trim()} ». Répondre sur le modèle demandé, ou ne rien envoyer.`,
      );
    }
  }

  // Price is firm, but a refusal must not read like a terms-of-service page,
  // nor invite the round of offers the seller will turn down anyway.
  if (replyInvitesNegotiation(body)) {
    issues.push("policy_breach");
    reasons.push(
      "prix : ni jargon (« la négociation n'est pas autorisée ») ni invitation à négocier (« faites une proposition », « discutons du prix »). Dire simplement : désolé, le prix c'est X €, on peut pas vraiment descendre.",
    );
  }

  // Never promise a Buy It Now an auction does not have, and never a payment
  // outside eBay.
  if (isAuctionListing(input.listing) && !auctionHasBuyItNow(input.listing)) {
    if (
      /\bachat\s+imm[ée]diat\b/i.test(body) &&
      !/\b(non|pas d['’]achat imm[ée]diat|no buy it now)\b/i.test(body)
    ) {
      issues.push("policy_breach");
      reasons.push(
        "cette annonce est une enchère : pas d'achat immédiat. Dire non, donner le prix actuel, et renvoyer vers l'enchère sur eBay.",
      );
    }
  }
  if (
    /\b(paypal|virement|esp[èe]ces|hors\s+ebay)\b/i.test(body) &&
    !/\b(uniquement|seulement|only)\b[^.]{0,40}\bebay\b/i.test(body) &&
    !/\bebay\b[^.]{0,40}\b(uniquement|seulement|only)\b/i.test(body)
  ) {
    issues.push("policy_breach");
    reasons.push(
      "paiement : jamais PayPal / virement / hors eBay. Répondre que le paiement se fait uniquement sur eBay.",
    );
  }

  // A question about an order already placed is about that order.
  if (
    isAboutExistingOrder(ask) &&
    replyPushesOtherListing({
      reply: body,
      ...(input.listing?.itemId ? { currentItemId: input.listing.itemId } : {}),
    })
  ) {
    issues.push("wrong_listing");
    reasons.push(
      "le client parle d'une commande déjà passée : rester sur cette commande (suivi / expédition). Interdit de coller un lien catalogue ou « on a X en stock ».",
    );
  }

  // The photos decide what is in the box, and we cannot see them.
  if (
    replyDeniesUnprovenComponent({
      reply: body,
      message: ask,
      listing: input.listing,
    })
  ) {
    issues.push("invented");
    reasons.push(
      "contenu du lot : l'annonce ne dit rien et les photos ne sont pas lisibles ici. Ne pas répondre non — laisser le vendeur répondre.",
    );
  }

  // Grade B sold as Grade A is a description the buyer can hold us to.
  const listingGrade = listingBlob.match(/\bgrade\s*([ab])\b/i)?.[1];
  const replyGrade = body.match(/\bgrade\s*([ab])\b/i)?.[1];
  if (
    listingGrade &&
    replyGrade &&
    listingGrade.toLowerCase() !== replyGrade.toLowerCase()
  ) {
    issues.push("invented");
    reasons.push(
      `l'annonce est Grade ${listingGrade.toUpperCase()} : ne pas parler de Grade ${replyGrade.toUpperCase()}.`,
    );
  }

  if (ROBOT_NO_INFO.test(body)) {
    issues.push("robotic");
    reasons.push(
      "ton robot (je ne peux pas fournir / source fiable / n'hésitez pas) — répondre en vendeur avec le titre, ou dire simplement qu'on n'a pas testé",
    );
  }

  if (replyHasPlaceholder(input.reply)) {
    issues.push("invented");
    reasons.push(
      "placeholder interdit ([adresse à insérer ici], […], TODO…) — jamais envoyer un trou de template au client",
    );
  }

  if (replyLeaksReturnAddress({ reply: input.reply, ask })) {
    issues.push("invented");
    reasons.push(
      "adresse de retour donnée sans demande explicite — seulement si le client demande l'adresse",
    );
  }

  if (UNTESTED_HEDGE.test(body) && !isRepairListing(listingBlob)) {
    issues.push("invented");
    reasons.push(
      "pièce vendue fonctionnelle (Grade A / générique) : ne pas dire qu'on ne teste pas / qu'on ne garantit pas. Générique = pas original Apple, ça marche.",
    );
  }

  // Address ask must use the real Marseille address, not invent one.
  if (
    isReturnAddressAsk(ask) &&
    /\badresse|stalingrad|renvoyer|envoyer\b/i.test(body) &&
    !/stalingrad/i.test(body)
  ) {
    issues.push("misses_question");
    reasons.push(
      "le client demande l'adresse de retour : répondre avec 7 square Stalingrad 13001 Marseille",
    );
  }

  // "Délai de livraison Italie" ≠ "envoi le jour même" seul.
  if (isDeliveryEtaAsk(ask) || Boolean(detectDestination(ask))) {
    const mentionsTransit =
      /\bjours?\s+ouvr/i.test(body) ||
      /\b\d+\s*[–\-]\s*\d+\s*jours?\b/i.test(body) ||
      /\benviron\s+\d/.test(body) ||
      /\b(4|5|3)\s*[–\-]\s*(5|6|4)\b/.test(body);
    const onlyDispatch =
      /jour m[êe]me|avant 15h/i.test(body) && !mentionsTransit;
    if (onlyDispatch || body.trim() === SAME_DAY_BEFORE_15) {
      issues.push("misses_question");
      reasons.push(
        "délai de livraison (arrivée) demandé : donner le transit (ex. Italie ≈ 4–5 jours ouvrés), pas seulement l'expédition le jour même",
      );
    }
  }

  if (isInvoiceAsk(ask) && /\b(facture|invoice|transmettr|tva)\b/i.test(body)) {
    issues.push("invented");
    reasons.push("ne pas répondre ni promettre une facture");
  }

  if (isLocalPickupAsk(ask) && PICKUP_CONFIRM.test(body) && !/pas de retrait|shipping only|uniquement envoi/i.test(body)) {
    issues.push("invented");
    reasons.push("ne pas confirmer un retrait / main propre");
  }

  const max = input.maxWords ?? 80;
  if (wordCount(body) > Math.max(60, Math.round(max * 1.8))) {
    issues.push("too_long");
    reasons.push("réponse trop longue pour eBay");
  }

  const block = issues.some(
    (i) =>
      i === "off_topic" ||
      i === "duplicate" ||
      i === "invented" ||
      i === "answers_old_topic" ||
      i === "model_mismatch" ||
      i === "wrong_listing" ||
      i === "policy_breach" ||
      i === "robotic" ||
      i === "misses_question",
  );
  const ok = issues.length === 0 || (issues.length === 1 && issues[0] === "too_long");

  return { ok, block, issues, reasons };
}

export function formatRepairNotes(qa: ReplyQualityResult): string {
  if (qa.reasons.length === 0) return "";
  return [
    "CORRECTION OBLIGATOIRE — le brouillon précédent était mauvais :",
    ...qa.reasons.map((r) => `- ${r}`),
    "Réécris uniquement la réponse à la DEMANDE ACTUELLE (tous les points de la rafale), faits seulement, court.",
    "Si l'annonce est pour réparation / pièces / HS : dis ce qu'il y a dans le titre et qu'on n'a pas tout testé. Jamais « je ne peux pas fournir » ni « source fiable ».",
    "Si c'est Grade A / générique / compatible / vendu fonctionnel : ça MARCHE. Générique = pas original Apple, très bonne qualité. INTERDIT « on ne teste pas » / « je ne peux pas garantir ».",
    "Adresse de retour : seulement si demandée explicitement → 7 square Stalingrad 13001 Marseille. INTERDIT tout placeholder.",
  ].join("\n");
}
