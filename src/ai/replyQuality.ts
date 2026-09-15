import { isAuctionListing, listingHasBuyItNow, isBuyItNowAsk, isItemPriceAsk } from "../analysis/listingFormat.js";
import { isInvoiceAsk, isRepairListing, isReturnAddressAsk, replyHasPlaceholder, replyLeaksReturnAddress } from "../analysis/sellerOps.js";
import { replyInventedInclusion } from "../analysis/inclusionAsk.js";
import { detectAllListingTopics } from "../analysis/listingEvidence.js";
import type { ClosedQuestionTopic } from "../analysis/types.js";
import type { ListingDetails } from "../ebay/tradingApi.js";
import type { EbayMessage } from "../ebay/messageApi.js";
import { isShippingCostAsk } from "../shipping/shippingCost.js";
import { isTrackingRequest } from "../shipping/detectTracking.js";
import { isDeliveryEtaAsk, detectDestination } from "../shipping/deliveryEta.js";
import { SAME_DAY_BEFORE_15 } from "../seller/casualPhrases.js";
import { isNearDuplicateReply, sellerAlreadyConfirmedCancel } from "../autopilot/alreadyReplied.js";
import { isAbstainReply } from "./abstain.js";

export type ReplyQualityIssue =
  | "off_topic"
  | "misses_question"
  | "duplicate"
  | "invented"
  | "too_long"
  | "answers_old_topic"
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
const PART_CODE = /\b(A\d{4}|820-\d{4,}-[A-Z0-9]+)\b/gi;
const ROBOT_NO_INFO =
  /je ne peux pas (fournir|confirmer)|je n['’]ai pas (d['’]?informations?|l['’]?info|cette information)|je n['’]ai pas (assez )?d['’]?info|informations?\s+(ne sont )?pas disponibles|je vous encourage|source fiable|d[ée]tails ne sont pas disponibles|n['’]h[ée]sitez pas|v[ée]rifiez les sp[ée]cifications|satisfaction est notre priorit|point d['’]honneur|nous mettons tout en [œoe]uvre|consulter un professionnel|expertise technique|nous pourrions envisager|tenir inform[ée] de l['’][ée]volution|je vous informe que nous proposons|merci pour votre compr[ée]hension|i (don['’]?t|do not) have (the )?information|i cannot (provide|confirm)/i;
const INVOICE_CLAIM_SENT =
  /\b(facture|invoice|fattura).{0,40}\b(envoy[ée]e?|transmis[et]|sent|inviata)\b|\b(envoy[ée]e?|transmis[et]|sent).{0,40}\b(facture|invoice|fattura)\b|\bje (vous )?(l['’]ai|ai) (d[ée]j[àa] )?(envoy|transmis)/i;
const UNTESTED_HEDGE =
  /ne test(e|ons) pas (toutes )?les fonctions|je ne peux pas garantir|on ne (peut|peut\s+pas) garant|n['’]est pas n[ée]cessairement .{0,60}apple|signes d['’]usure minimes/i;
const PICKUP_CONFIRM =
  /(r[ée]cup[ée]ration.{0,50}possible|heure qui vous convient|demain matin)/i;

function bodyWithoutSignature(reply: string): string {
  return reply
    .replace(/cordialement[\s\S]*$/i, "")
    .replace(/^\s*(bonjour|bonsoir|hello|hi)\s*,?\s*/i, "")
    .trim();
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
  if (isTrackingRequest(ask)) return false;
  return /\b(retour|rembours|return|refund)\b/i.test(ask);
}

function askedPrice(ask: string): boolean {
  return /\b(prix|tarif|combien|how much|cher)\b/i.test(ask);
}

function askedStock(ask: string, topics: ClosedQuestionTopic[]): boolean {
  if (isTrackingRequest(ask)) return false;
  return (
    topics.includes("available") ||
    /\b(dispo|disponible|stock|avez[- ]vous|encore)\b/i.test(ask)
  );
}

const CATALOG_STOCK_LINK =
  /oui on a .{0,100} en stock,\s*voici le lien/i;
const EBAY_ITEM_LINK = /ebay\.[a-z.]+\/itm\//i;

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
    /\b(annul|cancel)\b/i.test(body) &&
    !/\b(annul|cancel)\b/i.test(ask)
  ) {
    issues.push("off_topic");
    reasons.push("la réponse parle d'annulation alors que la question est autre");
  }

  if (
    sellerAlreadyConfirmedCancel({
      messages: input.messages ?? [],
      selfUsernames: input.selfUsernames ?? [],
    }) &&
    /confirmez l['’]?annulation|confirm the cancellation/i.test(body)
  ) {
    issues.push("duplicate");
    reasons.push("annulation déjà confirmée — ne pas redemander");
  }

  if (askedStock(ask, topics) && !STOCK_REPLY.test(body) && body.length > 20) {
    issues.push("misses_question");
    reasons.push("la question porte sur la dispo mais la réponse n'y répond pas");
  }

  if (
    /\b(samsung|galaxy)\b/i.test(ask) &&
    /\biphone\b/i.test(body) &&
    !/\biphone\b/i.test(ask)
  ) {
    issues.push("off_topic");
    reasons.push(
      "le client demande un Samsung / Galaxy, pas un iPhone — ne pas envoyer un lien iPhone",
    );
  }

  if (
    isTrackingRequest(ask) &&
    (CATALOG_STOCK_LINK.test(body) || EBAY_ITEM_LINK.test(body))
  ) {
    issues.push("off_topic");
    reasons.push(
      "commande déjà passée (suivi / expédition) : interdiction d'envoyer un lien catalogue ou une autre annonce",
    );
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

  if (ROBOT_NO_INFO.test(body)) {
    issues.push("robotic");
    reasons.push(
      "ton robot / « je n'ai pas d'informations » — si tu ne sais pas : NO_REPLY (ne rien envoyer)",
    );
  }

  if (isInvoiceAsk(ask)) {
    issues.push("invented");
    reasons.push(
      "demande de facture : NE RIEN RÉPONDRE (le vendeur l'envoie à la main) — interdit de dire que tu l'as envoyée",
    );
  } else if (INVOICE_CLAIM_SENT.test(body)) {
    issues.push("invented");
    reasons.push("ne pas prétendre avoir envoyé une facture");
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

  const listingBlob = `${input.listing?.title ?? ""}\n${input.listing?.descriptionText ?? ""}\n${input.listingFactsText ?? ""}`;
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

  if (replyInventedInclusion({ reply: body, ask, listing: input.listing })) {
    issues.push("invented");
    reasons.push(
      "Touch Bar / trackpad (ou autre inclus) : l'annonce ne le dit pas — NO_REPLY. INTERDIT d'inventer « sans trackpad / just the top case » (ça fait perdre la vente)",
    );
  }

  if (
    isAuctionListing(input.listing) &&
    !listingHasBuyItNow(input.listing) &&
    /achat.{0,40}imm[ée]diatement|buy\s+it\s+now\s+(is\s+)?available|oui.{0,80}achat\s+imm[ée]diat/i.test(
      body,
    )
  ) {
    issues.push("invented");
    reasons.push(
      "annonce en enchère sans achat immédiat : INTERDIT de dire que l'achat immédiat est possible",
    );
  }

  if (
    isItemPriceAsk(ask) &&
    !isBuyItNowAsk(ask) &&
    /frais d['’]?envoi sont ceux de l['’]annonce|shipping is as listed/i.test(body) &&
    !/\b(ench[eè]re|prix actuel|achat imm[ée]diat)\b/i.test(body)
  ) {
    issues.push("off_topic");
    reasons.push("question sur le prix de l'article, pas les frais de port");
  }

  if (
    /n[ée]gociation.{0,30}(n['’]est pas autoris[ée]e?|interdit)/i.test(body) ||
    /discuter du prix|faire part de votre proposition|votre proposition/i.test(body)
  ) {
    issues.push("robotic");
    reasons.push(
      "prix ferme : dire le tarif comme un vendeur (« on peut pas vraiment descendre »), pas « n'est pas autorisée » ni inviter une offre",
    );
  }

  const listingGrade = input.listing?.title?.match(/\bgrade\s*([ab])\b/i)?.[1]?.toUpperCase();
  const replyGradeA = /\bgrade\s*a\b/i.test(body);
  const replyGradeB = /\bgrade\s*b\b/i.test(body);
  if (listingGrade === "B" && replyGradeA && !replyGradeB) {
    issues.push("invented");
    reasons.push("l'annonce est Grade B — ne pas parler de Grade A");
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
    "Si tu ne sais pas : NO_REPLY. INTERDIT « je n'ai pas d'informations ». Facture : NO_REPLY. Garantie : 3 mois.",
    "Touch Bar / trackpad / contenu d'un topcase : seulement si c'est ÉCRIT dans l'annonce. Sinon NO_REPLY. INTERDIT d'inventer un non (« just the top case », « does not include »).",
  ].join("\n");
}
