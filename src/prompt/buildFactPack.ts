import type { ResponsePlan } from "../analysis/types.js";
import type { EbayMessage } from "../ebay/messageApi.js";
import type { ListingDetails } from "../ebay/tradingApi.js";
import { isFromSelf } from "../conversations/messageSides.js";
import { selectListingFacts } from "./selectListingFacts.js";
import type { ShipmentResolution } from "../shipping/types.js";
import {
  CORE_REPLY_PRINCIPLES,
  FORBIDDEN_UNLESS_BUYER_ASKED,
  isBuyerUpset,
} from "./policyRules.js";
import type { SellerProfile } from "./types.js";

export type ReplyFactPack = {
  intentLabel: string;
  languageCode: string;
  buyerAsks: string[];
  listingFacts: string[];
  shipmentLine?: string;
  policyLines: string[];
  listingAnswerability?: string;
  listingEvidence: string[];
  suggestedDirectReply?: string;
  buyerUpset: boolean;
  forbiddenUnlessBuyerAsked: string[];
  principles: string[];
  /** Short recent thread — not the full history. */
  threadDigest?: string;
  /** Joined current burst (all unanswered consecutive buyer messages). */
  currentAsk?: string;
};

function shipmentLine(s: ShipmentResolution | undefined): string | undefined {
  if (!s) return undefined;
  if (s.kind === "not_shipped") return "Suivi : colis pas encore expédié.";
  if (s.kind === "shipped") {
    const parts = [
      "Suivi : expédié",
      s.trackingNumber ? `n° ${s.trackingNumber}` : undefined,
      s.trackingStatus ? `statut ${s.trackingStatus}` : undefined,
      s.statusLabel ? `(${s.statusLabel})` : undefined,
      s.shippedDate ? `envoyé ${s.shippedDate.slice(0, 10)}` : undefined,
    ].filter(Boolean);
    return parts.join(" · ");
  }
  if (s.kind === "order_not_found" || s.kind === "missing_item") {
    return "Suivi : commande / article non trouvé côté eBay — ne pas inventer de statut.";
  }
  return `Suivi : ${s.kind} — vérifier avant d'affirmer.`;
}

/**
 * Authoritative facts for the model — outweigh history and RAG.
 */
export function buildFactPack(input: {
  plan: ResponsePlan;
  pendingBuyerMessages: EbayMessage[];
  latestText: string;
  listing?: ListingDetails;
  sellerProfile?: SellerProfile | null;
  shipment?: ShipmentResolution;
  threadDigest?: string;
  currentAsk?: string;
}): ReplyFactPack {
  const current = input.currentAsk?.trim() || input.latestText.trim();
  const buyerAsks =
    input.pendingBuyerMessages.length > 0
      ? input.pendingBuyerMessages
          .map((m) => m.messageBody?.trim())
          .filter((t): t is string => Boolean(t))
      : current
        ? [current]
        : [];

  const policyLines: string[] = [];
  const p = input.sellerProfile;
  if (p?.shippingDelayText?.trim()) {
    policyLines.push(`Expédition : ${p.shippingDelayText.trim()}`);
  }
  if (p?.returnPolicyText?.trim()) {
    policyLines.push(`Retours : ${p.returnPolicyText.trim()}`);
  }
  if (p?.refundPolicyText?.trim()) {
    policyLines.push(`Remboursement : ${p.refundPolicyText.trim()}`);
  }
  if (p?.negotiationPolicyText?.trim()) {
    policyLines.push(`Négociation : ${p.negotiationPolicyText.trim()}`);
  }
  if (p?.negotiationAllowed === false) {
    policyLines.push("Négociation de prix : non autorisée.");
  }

  const joinedAsks = buyerAsks.join("\n");
  const buyerUpset = isBuyerUpset(joinedAsks) || isBuyerUpset(input.latestText);

  return {
    intentLabel: input.plan.intentLabel,
    languageCode: input.plan.languageCode,
    buyerAsks,
    listingFacts: selectListingFacts(input.listing, current),
    shipmentLine: shipmentLine(input.shipment),
    policyLines,
    listingAnswerability: input.plan.listingAnswerability,
    listingEvidence: input.plan.listingEvidence ?? [],
    suggestedDirectReply: input.plan.suggestedDirectReply,
    buyerUpset,
    forbiddenUnlessBuyerAsked: [...FORBIDDEN_UNLESS_BUYER_ASKED],
    principles: [...CORE_REPLY_PRINCIPLES],
    threadDigest: input.threadDigest?.trim() || undefined,
    currentAsk: current || undefined,
  };
}

export function formatFactPackSection(pack: ReplyFactPack): string {
  const multi = pack.buyerAsks.length > 1;
  const demand = multi
    ? pack.buyerAsks.map((a, i) => `(${i + 1}) ${a}`).join("\n")
    : pack.currentAsk?.trim() || pack.buyerAsks.at(-1) || "(aucun texte acheteur)";
  const lines = [
    "========== DEMANDE ACTUELLE (à traiter en priorité) ==========",
    demand,
    "",
    multi
      ? "OBLIGATOIRE : répondre à CHAQUE point (rafale de messages sans réponse vendeur). Interdit d'en oublier un. Interdit de ressortir un vieux sujet du fil."
      : "Réponds UNIQUEMENT à ça. Interdit de ressortir un vieux sujet du fil.",
    `Intention : ${pack.intentLabel} · langue : ${pack.languageCode}`,
    pack.buyerUpset
      ? "Ton client : CONTRARIÉ — commencer par une excuse courte."
      : "Ton client : neutre / standard.",
  ];

  lines.push("", "========== FAITS PRODUIT (seulement ceux utiles à la demande) ==========");
  for (const f of pack.listingFacts) lines.push(`- ${f}`);

  if (pack.shipmentLine) {
    lines.push("", pack.shipmentLine);
  }

  if (pack.policyLines.length) {
    lines.push("", "Politiques vendeur (n'en parle que si demandé) :");
    for (const p of pack.policyLines) lines.push(`- ${p}`);
  }

  if (pack.listingAnswerability) {
    lines.push("", `Couverture annonce : ${pack.listingAnswerability}`);
  }
  if (pack.listingEvidence.length) {
    lines.push(`Preuves : ${pack.listingEvidence.join(" | ")}`);
  }
  if (pack.suggestedDirectReply) {
    lines.push(`Réponse directe suggérée : ${pack.suggestedDirectReply}`);
  }

  if (pack.threadDigest?.trim()) {
    lines.push("", "========== FIL RÉCENT (contexte, pas le sujet à traiter) ==========");
    lines.push(pack.threadDigest.trim());
  }

  lines.push("", "Sujets interdits sauf demande claire du client :");
  for (const t of pack.forbiddenUnlessBuyerAsked) {
    lines.push(`- ${t}`);
  }

  return lines.join("\n");
}

/** Last few messages only — long history made the model revive old topics. */
export function formatConversationDigest(
  messages: EbayMessage[],
  max = 6,
  selfUsername?: string,
): string {
  const slice = messages.length > max ? messages.slice(-max) : messages;
  if (slice.length === 0) return "(aucun message)";
  const currentMarks = new Set<number>();
  for (let i = slice.length - 1; i >= 0; i -= 1) {
    if (
      isFromSelf({
        senderUsername: slice[i]?.senderUsername,
        selfUsername,
      })
    ) {
      break;
    }
    currentMarks.add(i);
  }

  return slice
    .map((m, i) => {
      const who = m.senderUsername?.trim() || "?";
      const body = (m.messageBody ?? "").replace(/\s+/g, " ").trim().slice(0, 280);
      const mark = currentMarks.has(i) ? " >>> DEMANDE ACTUELLE" : "";
      return `${who}: ${body || "(vide)"}${mark}`;
    })
    .join("\n");
}
