import {
  classifySellerCase,
  formatAskPackagingPhotos,
  formatPartialRefundOffer,
  formatWrongAddressCancel,
  isWrongAddressAsk,
  isBuyerReturnShipped,
  isShipTodayPhrase,
} from "../analysis/sellerCase.js";
import { formatPickupRefuse, formatColorPreferenceRefuse, formatReturnAddressReply, listingColorLabel } from "../analysis/sellerOps.js";
import {
  buildListingFactualReply,
  detectAllListingTopics,
  extractAskedModelLabel,
} from "../analysis/listingEvidence.js";
import type { ResponsePlan } from "../analysis/types.js";
import {
  buildCatalogAvailabilityReply,
  buildApplePartsReply,
  extractAskedProductPhrase,
  extractApplePartNumbers,
  extractCatalogSearchTokens,
  resolveApplePartsStock,
  askedFinishDiffersFromListing,
  stripReplyEnvelope,
} from "../catalog/index.js";
import {
  canAssertSameProduct,
  describeIdentity,
  extractAskedIdentity,
  identityMatchesText,
  isEmptyIdentity,
} from "../product/identity.js";
import { listingIdentityText } from "../product/listingText.js";
import type { ListingDetails } from "../ebay/tradingApi.js";
import {
  collectPendingBuyerMessages,
  pendingTextForReply,
  filterSubstantivePending,
} from "../conversations/pendingBuyerMessages.js";
import {
  currentAskFingerprints,
  selectCurrentBuyerAsk,
} from "../conversations/currentAsk.js";
import { isFromSelf } from "../conversations/messageSides.js";
import {
  buildFactPack,
  formatConversationDigest,
} from "../prompt/buildFactPack.js";
import { filterSimilarForStyle } from "../rag/filterSimilar.js";
import { isTrackingRequest } from "../shipping/detectTracking.js";
import { formatShipmentReply } from "../shipping/formatShipmentReply.js";
import { isTrackingFollowUp } from "../shipping/trackingFollowUp.js";
import {
  asksFreeShipping,
  buyerLikelyAbroad,
  formatShippingCostReply,
  isShippingCostAsk,
  replyInventsFreeShipping,
} from "../shipping/shippingCost.js";
import {
  formatAuctionReply,
  isAuctionListing,
  isBuyItNowAsk,
  isOffPlatformPaymentAsk,
} from "../analysis/auction.js";
import { unprovableContentsAsk } from "../analysis/contentsAsk.js";
import { isAboutExistingOrder } from "../analysis/orderContext.js";
import {
  formatFirmPriceReply,
  isPriceNegotiation,
} from "../analysis/priceOffer.js";
import { isBuyerUpset } from "../prompt/policyRules.js";
import { isClosingAck, isNoReplyNeeded } from "../analysis/needsReply.js";
import { allowFactualShortcut, blocksFactualShortcut } from "../analysis/factualShortcut.js";
import { isAbstainReply } from "./abstain.js";
import { reasonThenReply } from "./reasonThenReply.js";
import { assessReplyQuality, formatRepairNotes } from "./replyQuality.js";
import type {
  AiEngineDeps,
  AiEngineResult,
  AiEngineRunOptions,
} from "./types.js";

function normalizeHay(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * True when the conversation listing is the product the buyer asked about.
 *
 * Identity decides whenever we can read a model out of both sides; the token
 * heuristic below is only a fallback for asks that name no product at all.
 */
function listingCoversProductAsk(
  message: string,
  listing: ListingDetails | undefined,
): boolean {
  if (!listing) return false;
  if (askedFinishDiffersFromListing(message, listing.title)) return false;

  const asked = extractAskedIdentity(message);
  if (!isEmptyIdentity(asked)) {
    const verdict = identityMatchesText(asked, listingIdentityText(listing));
    if (verdict === "match") return true;
    if (verdict === "mismatch") return false;
  }

  const hay = normalizeHay(
    [
      listing.title ?? "",
      ...listing.variations.flatMap((v) =>
        v.specifics.map((s) => `${s.name} ${s.value}`),
      ),
    ].join(" "),
  );
  const model = extractAskedModelLabel(message);
  if (model) {
    const m = normalizeHay(model);
    if (hay.includes(m)) return true;
    const num = model.match(/(\d+)/)?.[1];
    if (num && (hay.includes(`pro ${num}`) || hay.includes(` ${num}`))) {
      return true;
    }
    return false;
  }
  const tokens = extractCatalogSearchTokens(message).filter((t) => t.length >= 4);
  if (tokens.length === 0) return true;
  const hits = tokens.filter((t) => hay.includes(t));
  return hits.length >= Math.min(2, tokens.length);
}

function withPendingBurst(plan: ResponsePlan, pendingCount: number): ResponsePlan {
  if (pendingCount < 2) return plan;
  const extraWords = Math.min(80, (pendingCount - 1) * 35);
  return {
    ...plan,
    isMultiQuestion: true,
    isSimpleQuestion: false,
    intent: plan.intent === "greeting" || plan.intent === "thanks"
      ? "multi_question"
      : plan.intent,
    intentLabel:
      plan.intent === "multi_question"
        ? plan.intentLabel
        : `${plan.intentLabel} + ${pendingCount} messages en attente`,
    recommendedLength: "medium",
    maxWords: Math.max(plan.maxWords, 90) + extraWords,
    detailLevel: "focused",
    reasons: [
      ...plan.reasons,
      `${pendingCount} messages acheteur d'affilée — répondre à tous`,
    ],
  };
}

function applySellerCase(
  plan: ResponsePlan,
  input: {
    latestText: string;
    messages: Parameters<typeof classifySellerCase>[0]["messages"];
    sellerUsername?: string;
    listingPrice?: string;
  },
): ResponsePlan {
  const sellerCase = classifySellerCase({
    latestText: input.latestText,
    messages: input.messages,
    sellerUsername: input.sellerUsername,
    listingPrice: input.listingPrice,
  });
  if (sellerCase.kind === "none") return plan;

  return {
    ...plan,
    needsSellerIntervention: sellerCase.needsSellerIntervention,
    escalationReason: sellerCase.kind,
    escalationLabel: sellerCase.summaryFr,
    ...(sellerCase.autoReplyKind
      ? { autoReplyKind: sellerCase.autoReplyKind }
      : { autoReplyKind: undefined }),
    reasons: [...plan.reasons, `cas: ${sellerCase.summaryFr}`],
  };
}

function resolveSellerUsername(
  options: AiEngineRunOptions,
  listingSellerUsername?: string,
): string | undefined {
  return options.sellerUsername?.trim() || listingSellerUsername?.trim();
}

function baseResult(
  input: {
    deps: AiEngineDeps;
    options: AiEngineRunOptions;
    context: Awaited<ReturnType<AiEngineDeps["loadContext"]>>;
    sellerProfile: Awaited<ReturnType<AiEngineDeps["loadSellerProfile"]>>;
    responsePlan: ReturnType<AiEngineDeps["analyzeMessage"]>;
    sellerUsername?: string;
    startedAt: number;
    model: string;
    askFingerprints?: string[];
    currentAskText?: string;
  },
  extra: Partial<AiEngineResult> &
    Pick<AiEngineResult, "reply" | "systemPrompt" | "userPrompt">,
): AiEngineResult {
  let reply = extra.reply;
  if (reply && input.currentAskText) {
    const qa = assessReplyQuality({
      reply,
      currentAsk: input.currentAskText,
      listing: input.context.listing,
      messages: input.context.messages,
      selfUsernames: [input.sellerUsername],
    });
    if (qa.block) {
      reply = "";
    }
  }
  return {
    sellerProfile: input.sellerProfile,
    listing: input.context.listing,
    listingError: input.context.listingError,
    conversation: {
      conversationId: input.context.conversationId,
      messages: input.context.messages,
      latestMessage: input.context.latestMessage,
    },
    similarConversations: [],
    responsePlan: input.responsePlan,
    model: input.model,
    metadata: {
      languageCode: input.responsePlan.languageCode,
      languageLabel: input.responsePlan.languageLabel,
      listingItemId: input.context.listingItemId,
      messageCount: input.context.messages.length,
      truncatedMessages: false,
      similarCount: 0,
      sellerUsername: input.sellerUsername,
      intent: input.responsePlan.intent,
      intentLabel: input.responsePlan.intentLabel,
      recommendedLength: input.responsePlan.recommendedLength,
      detailLevel: input.responsePlan.detailLevel,
      maxWords: input.responsePlan.maxWords,
      ...(input.askFingerprints?.length
        ? { currentAskFingerprints: input.askFingerprints }
        : {}),
      ...(input.currentAskText
        ? { currentAskText: input.currentAskText }
        : {}),
    },
    latencyMs: Date.now() - input.startedAt,
    ...extra,
    reply,
  };
}

/**
 * Pure orchestration pipeline.
 * Steps only call injected dependencies — no infra knowledge here.
 */
export async function runAiPipeline(
  deps: AiEngineDeps,
  options: AiEngineRunOptions,
): Promise<AiEngineResult> {
  const startedAt = Date.now();
  const model = options.model ?? deps.defaultModel;

  const context = await deps.loadContext(options.conversationId);

  const sellerUsername = resolveSellerUsername(
    options,
    context.listing?.sellerUsername,
  );
  const sellerProfile = sellerUsername
    ? await deps.loadSellerProfile(sellerUsername)
    : null;

  const pendingBuyerMessages = collectPendingBuyerMessages({
    messages: context.messages,
    selfUsername: sellerUsername,
  });
  const currentAsk = selectCurrentBuyerAsk(pendingBuyerMessages);
  const substantivePending = currentAsk.messages.length
    ? currentAsk.messages
    : filterSubstantivePending(pendingBuyerMessages);
  const pendingText = currentAsk.text || pendingTextForReply(pendingBuyerMessages);
  const latestText =
    pendingText || context.latestMessage?.messageBody?.trim() || "";
  const askNow = currentAsk.text || latestText;
  const askFingerprints = currentAskFingerprints(
    context.conversationId,
    currentAsk.messages.length ? currentAsk.messages : substantivePending,
  );

  const commonEarly = {
    deps,
    options,
    context,
    sellerProfile,
    responsePlan: deps.analyzeMessage({
      text: askNow,
      ...(context.listing ? { listing: context.listing } : {}),
    }),
    sellerUsername,
    startedAt,
    model,
    askFingerprints,
    currentAskText: askNow,
  };

  // The buyer's last word closes the thread. Older unanswered messages do not
  // reopen it: relaunching after "Ok merci" is how hl5198 got a reply about an
  // SSD and a cancellation they had already confirmed.
  const lastPending = pendingBuyerMessages[pendingBuyerMessages.length - 1];
  const threadClosedByBuyer =
    pendingBuyerMessages.length > 0 && isClosingAck(lastPending?.messageBody);

  // Nothing useful to answer (merci / ok / bonjour seul / vide).
  if (
    threadClosedByBuyer ||
    (substantivePending.length === 0 &&
      isNoReplyNeeded(context.latestMessage?.messageBody ?? latestText))
  ) {
    return baseResult(
      {
        ...commonEarly,
        responsePlan: {
          ...commonEarly.responsePlan,
          intentLabel: "rien à répondre",
          reasons: [
            ...commonEarly.responsePlan.reasons,
            "message inutile / pas de question",
          ],
        },
      },
      {
        systemPrompt: "",
        userPrompt: "skip:no_reply_needed",
        reply: "",
        escalated: false,
      },
    );
  }

  const basePlan = withPendingBurst(
    deps.analyzeMessage({
      text: askNow,
      ...(context.listing ? { listing: context.listing } : {}),
    }),
    substantivePending.length,
  );
  const responsePlan = applySellerCase(basePlan, {
    latestText: askNow,
    messages: context.messages,
    sellerUsername,
    listingPrice: context.listing?.price,
  });

  const common = {
    deps,
    options,
    context,
    sellerProfile,
    responsePlan,
    sellerUsername,
    startedAt,
    model,
    askFingerprints,
    currentAskText: askNow,
  };
  if (responsePlan.needsSellerIntervention) {
    return baseResult(common, {
      systemPrompt: "",
      userPrompt: "",
      reply: "",
      escalated: true,
    });
  }

  // Damaged expensive item — fixed ~10% gesture, no LLM promises.
  if (responsePlan.autoReplyKind === "partial_refund_10") {
    const reply = formatPartialRefundOffer({
      languageCode: responsePlan.languageCode,
      signature: sellerProfile?.signature,
    });
    return baseResult(common, {
      systemPrompt: "",
      userPrompt: "case:partial_refund_10",
      reply,
      escalated: false,
    });
  }

  // Exterior packaging damage — ask photos, no return/litige.
  if (responsePlan.autoReplyKind === "ask_packaging_photos") {
    const reply = formatAskPackagingPhotos({
      languageCode: responsePlan.languageCode,
      signature: sellerProfile?.signature,
      apologize: isBuyerUpset(latestText),
    });
    return baseResult(common, {
      systemPrompt: "",
      userPrompt: "case:ask_packaging_photos",
      reply,
      escalated: false,
    });
  }

  // Wrong address / cancel — seller cancels themselves, never "eBay must cancel".
  if (responsePlan.autoReplyKind === "wrong_address_cancel") {
    const reply = formatWrongAddressCancel({
      languageCode: responsePlan.languageCode,
      signature: sellerProfile?.signature,
      mentionsAddress: isWrongAddressAsk(askNow),
    });
    return baseResult(common, {
      systemPrompt: "",
      userPrompt: "case:wrong_address_cancel",
      reply,
      escalated: false,
    });
  }

  // Main propre / récupérer sur place — always refuse, shipping only.
  if (responsePlan.autoReplyKind === "refuse_pickup") {
    const reply = formatPickupRefuse({
      languageCode: responsePlan.languageCode,
      signature: sellerProfile?.signature,
    });
    return baseResult(common, {
      systemPrompt: "",
      userPrompt: "case:refuse_pickup",
      reply,
      escalated: false,
    });
  }

  // Wrong colour vs listing — buyer pays return, no prepaid label.
  if (responsePlan.autoReplyKind === "color_preference_return") {
    const reply = formatColorPreferenceRefuse({
      languageCode: responsePlan.languageCode,
      signature: sellerProfile?.signature,
      listingColor: listingColorLabel(context.listing?.title),
    });
    return baseResult(common, {
      systemPrompt: "",
      userPrompt: "case:color_preference_return",
      reply,
      escalated: false,
    });
  }

  // Buyer asked for the return address — give the real one, never a placeholder.
  if (responsePlan.autoReplyKind === "return_address") {
    const reply = formatReturnAddressReply({
      languageCode: responsePlan.languageCode,
      signature: sellerProfile?.signature,
    });
    return baseResult(common, {
      systemPrompt: "",
      userPrompt: "case:return_address",
      reply,
      escalated: false,
    });
  }

  // Stock / variante / délai — jamais si le fil parle d'un retour déjà envoyé.
  const recentBuyerText = context.messages
    .filter(
      (m) =>
        !isFromSelf({
          senderUsername: m.senderUsername,
          selfUsername: sellerUsername,
        }),
    )
    .slice(-6)
    .map((m) => m.messageBody ?? "")
    .join("\n");
  const returnThread =
    isBuyerReturnShipped(latestText) || isBuyerReturnShipped(recentBuyerText);
  if (returnThread) {
    return baseResult(
      {
        ...common,
        responsePlan: {
          ...responsePlan,
          needsSellerIntervention: true,
          escalationReason: "buyer_return_shipped",
          escalationLabel:
            "Cet acheteur a envoyé le retour (suivi) — à traiter, ne pas parler de stock / expédition",
        },
      },
      {
        systemPrompt: "",
        userPrompt: "skip:buyer_return_shipped",
        reply: "",
        escalated: true,
      },
    );
  }

  // Frais de port / 0 € : tarifs annonce, 0 € = France only.
  if (isShippingCostAsk(latestText)) {
    const abroad =
      buyerLikelyAbroad(latestText) || buyerLikelyAbroad(recentBuyerText);
    const reply = formatShippingCostReply({
      listing: context.listing,
      languageCode: responsePlan.languageCode,
      signature: sellerProfile?.signature,
      askedFree: asksFreeShipping(latestText),
      buyerAbroad: abroad,
    });
    return baseResult(common, {
      systemPrompt: "",
      userPrompt: abroad
        ? "shipping_cost:abroad_no_free"
        : "shipping_cost:listing_rates",
      reply,
      escalated: false,
    });
  }

  // « envoyez ce jour » sans question : délai d'envoi, jamais le stock.
  if (
    isShipTodayPhrase(latestText) &&
    !blocksFactualShortcut(latestText) &&
    !blocksFactualShortcut(askNow)
  ) {
    const shipPack = buildListingFactualReply({
      message: "délai d'expédition ?",
      listing: context.listing,
      languageCode: responsePlan.languageCode,
      signature: sellerProfile?.signature,
    });
    if (shipPack.reply) {
      return baseResult(common, {
        systemPrompt: "",
        userPrompt: "listing:ship_today_only",
        reply: shipPack.reply,
        escalated: false,
      });
    }
  }

  // Enchère : pas d'achat immédiat à promettre, et le paiement reste sur eBay.
  if (isAuctionListing(context.listing)) {
    const auctionReply = formatAuctionReply({
      listing: context.listing,
      askedBuyItNow: isBuyItNowAsk(latestText) || isBuyItNowAsk(askNow),
      askedOffPlatformPayment:
        isOffPlatformPaymentAsk(latestText) || isOffPlatformPaymentAsk(askNow),
      languageCode: responsePlan.languageCode,
      signature: sellerProfile?.signature,
    });
    if (auctionReply) {
      return baseResult(common, {
        systemPrompt: "",
        userPrompt: "auction:format",
        reply: auctionReply,
        escalated: false,
      });
    }
  }

  // Offre / négociation : ferme sur le tarif, souple sur le ton.
  if (
    isPriceNegotiation(latestText) &&
    !isAuctionListing(context.listing) &&
    !blocksFactualShortcut(latestText)
  ) {
    const firm = formatFirmPriceReply({
      listingPrice: context.listing?.price,
      currency: context.listing?.currency,
      languageCode: responsePlan.languageCode,
      signature: sellerProfile?.signature,
    });
    if (firm) {
      return baseResult(common, {
        systemPrompt: "",
        userPrompt: "price:firm",
        reply: firm,
        escalated: false,
      });
    }
  }

  // « Il y a la Touch Bar ? » — c'est sur les photos, qu'on ne sait pas lire.
  // Un « non » inventé fait perdre la vente : le vendeur répond lui-même.
  const contents = unprovableContentsAsk({
    message: askNow || latestText,
    listing: context.listing,
  });
  if (contents.unprovable) {
    return baseResult(
      {
        ...common,
        responsePlan: {
          ...responsePlan,
          needsSellerIntervention: true,
          escalationReason: "photo_question",
          escalationLabel: `Contenu du lot demandé (${contents.components.join(", ")}) — pas dans l'annonce, seules les photos le disent`,
        },
      },
      {
        systemPrompt: "",
        userPrompt: `skip:contents_not_in_listing:${contents.components.join(",")}`,
        reply: "",
        escalated: true,
      },
    );
  }

  const coversAsk = listingCoversProductAsk(latestText, context.listing);
  const askedIdentity = extractAskedIdentity(latestText);
  const askedProductIdentified = !isEmptyIdentity(askedIdentity);
  // Only claim the conversation listing is "tjr dispo" once we can show it is
  // what they asked for. For a coded ask, "not refuted" is not good enough.
  const currentListingAnswersAsk = canAssertSameProduct(
    askedIdentity,
    listingIdentityText(context.listing),
  );
  const productPhrase = extractAskedProductPhrase(latestText);
  const appleParts = extractApplePartNumbers(latestText);
  const listingHay = normalizeHay(context.listing?.title ?? "");
  const foreignApple = appleParts.filter(
    (p) => !listingHay.includes(p.toLowerCase()),
  );
  const foreignProductAsk = Boolean(productPhrase) && !coversAsk;

  const listingFactual = buildListingFactualReply({
    message: latestText,
    listing: context.listing,
    languageCode: responsePlan.languageCode,
    signature: sellerProfile?.signature,
    skipAvailability: foreignProductAsk || appleParts.length > 0,
  });
  const listingTopics = detectAllListingTopics(latestText);
  const askedStock = listingTopics.includes("available");
  const wantsAvailability =
    askedStock || Boolean(productPhrase) || foreignApple.length > 0;

  const shortcutOk =
    allowFactualShortcut(latestText) && !blocksFactualShortcut(latestText);

  // Apple / catalogue / templates stock : UNIQUEMENT question fermée stock/délai.
  if (
    shortcutOk &&
    sellerUsername &&
    (foreignApple.length > 0 || (askedStock && appleParts.length > 0))
  ) {
    try {
      const parts = await resolveApplePartsStock({
        sellerUsername,
        message: latestText,
        excludeItemId: context.listing?.itemId,
        currentListing: context.listing,
      });
      if (parts.length > 0) {
        const built = buildApplePartsReply({
          parts,
          shippingText: listingFactual.shippingText,
          languageCode: responsePlan.languageCode,
          signature: sellerProfile?.signature,
          currentItemId: context.listing?.itemId,
        });
        return baseResult(common, {
          systemPrompt: "",
          userPrompt: `catalog:apple_parts:${built.signals.join(",")}`,
          reply: built.reply,
          escalated: false,
        });
      }
    } catch {
      // fall through only if resolve crashes; never let LLM invent Apple stock
    }
  }

  if (
    shortcutOk &&
    wantsAvailability &&
    deps.searchCatalog &&
    sellerUsername &&
    substantivePending.length <= 1
  ) {
    // A sold-out listing is exactly when the shop's other listings matter: the
    // buyer must get the link to the same part elsewhere, not "on n'en a plus".
    const currentListingSellable =
      (context.listing?.quantityAvailable ?? 1) > 0 &&
      (context.listing?.listingStatus ?? "Active").toLowerCase() === "active";
    const shouldSearchCatalog =
      foreignProductAsk || !coversAsk || (askedStock && !currentListingSellable);

    if (shouldSearchCatalog) {
      try {
        const rawHits = await deps.searchCatalog({
          sellerUsername,
          message: latestText,
          excludeItemId: context.listing?.itemId,
          limit: 5,
        });
        // The search port ranks on text overlap. Whatever it hands back, a
        // listing for another model is never an answer — enforce that here so
        // the guarantee does not depend on which search is wired in.
        const hits = askedProductIdentified
          ? rawHits.filter((hit) =>
              canAssertSameProduct(askedIdentity, hit.matchText ?? hit.title),
            )
          : rawHits;
        const askedLabel = askedProductIdentified
          ? describeIdentity(askedIdentity)
          : extractAskedModelLabel(latestText) || productPhrase || "cet article";
        const catalog = buildCatalogAvailabilityReply({
          message: latestText,
          askedLabel,
          hits,
          foreignProductAsk,
          askedProductIdentified,
          currentListingAnswersAsk,
          currentListingTitle: context.listing?.title,
          currentListingInStock:
            (context.listing?.quantityAvailable ?? 1) > 0 &&
            (context.listing?.listingStatus ?? "Active").toLowerCase() ===
              "active",
          extraParts: listingFactual.shippingText
            ? [listingFactual.shippingText]
            : [],
          currentListingBody: listingFactual.reply
            ? stripReplyEnvelope(listingFactual.reply)
            : null,
          currentAnswerability: listingFactual.answerability,
          languageCode: responsePlan.languageCode,
          signature: sellerProfile?.signature,
        });
        if (
          catalog.reply &&
          (catalog.answerability === "direct_yes" ||
            catalog.answerability === "direct_no")
        ) {
          return baseResult(common, {
            systemPrompt: "",
            userPrompt: `catalog:${catalog.answerability}:${catalog.signals.join(",")}`,
            reply: catalog.reply,
            escalated: false,
          });
        }
      } catch {
        // Catalogue optional — fall through to listing-only reply.
      }
    }
  }

  if (
    shortcutOk &&
    listingFactual.reply &&
    (listingFactual.answerability === "direct_yes" ||
      listingFactual.answerability === "direct_no") &&
    substantivePending.length <= 1
  ) {
    return baseResult(common, {
      systemPrompt: "",
      userPrompt: `listing:${listingFactual.topics.join("+")}:${listingFactual.answerability}`,
      reply: listingFactual.reply,
      escalated: false,
    });
  }

  const stockTopics = new Set(["available", "fast_shipping"]);
  if (
    shortcutOk &&
    responsePlan.suggestedDirectReply &&
    (responsePlan.listingAnswerability === "direct_yes" ||
      responsePlan.listingAnswerability === "direct_no") &&
    responsePlan.closedQuestionTopic &&
    stockTopics.has(responsePlan.closedQuestionTopic) &&
    substantivePending.length <= 1
  ) {
    const sig = sellerProfile?.signature?.trim() || "Cordialement,\nSNOWOLF";
    const body = responsePlan.suggestedDirectReply.trim();
    const alreadyFull =
      /^bonjour\b/i.test(body) || /^hi\b/i.test(body);
    let reply = alreadyFull
      ? body.includes("Cordialement") || body.includes("Best regards")
        ? body
        : `${body}\n\n${sig}`
      : responsePlan.languageCode === "en"
        ? `Hi,\n\n${body}\n\n${sig}`
        : `Bonjour,\n\n${body}\n\n${sig}`;
    if (/Cordialement,?\s*$/i.test(reply) && !/SNOWOLF/i.test(reply)) {
      reply = `${reply.replace(/Cordialement,?\s*$/i, "Cordialement,")}\nSNOWOLF`;
    }
    return baseResult(common, {
      systemPrompt: "",
      userPrompt: `listing:${responsePlan.closedQuestionTopic}:${responsePlan.listingAnswerability}`,
      reply,
      escalated: false,
    });
  }

  // Resolve shipment when useful (tracking ask or for fact-pack).
  const trackingAsk =
    responsePlan.intent === "shipping_tracking" ||
    isTrackingRequest(latestText) ||
    pendingBuyerMessages.some((m) => isTrackingRequest(m.messageBody));

  const orderAsk =
    isAboutExistingOrder(askNow) ||
    isAboutExistingOrder(latestText) ||
    pendingBuyerMessages.some((m) => isAboutExistingOrder(m.messageBody));

  // What this buyer actually bought. Without it, a question about an order has
  // nothing factual behind it and the reply drifts to the catalogue.
  let buyerOrders: Awaited<
    ReturnType<NonNullable<AiEngineDeps["loadBuyerOrders"]>>
  > = [];
  if (deps.loadBuyerOrders && (orderAsk || trackingAsk)) {
    const buyerUsername = pendingBuyerMessages
      .map((m) => m.senderUsername?.trim())
      .find((name) => name && name !== sellerUsername);
    buyerOrders = await deps
      .loadBuyerOrders({
        ...(buyerUsername ? { buyerUsername } : {}),
        ...(context.listing?.itemId ? { itemId: context.listing.itemId } : {}),
        limit: 3,
      })
      .catch(() => []);
  }

  let shipment = undefined as
    | Awaited<ReturnType<NonNullable<AiEngineDeps["resolveShipment"]>>>
    | undefined;

  if (deps.resolveShipment && (trackingAsk || responsePlan.intent === "after_sales")) {
    shipment = await deps.resolveShipment({
      conversationId: options.conversationId,
      itemId: context.listingItemId ?? context.listing?.itemId,
    });
  }

  // Tracking / « pas reçu » — factual reply (esp. when marked delivered).
  if (trackingAsk && shipment) {
    const delivered =
      shipment.kind === "shipped" && shipment.trackingStatus === "delivered";
    const alone =
      !responsePlan.isMultiQuestion && substantivePending.length <= 1;

    if (alone || delivered) {
      const followUp = isTrackingFollowUp({
        messages: context.messages,
        sellerUsername,
      });
      let reply = formatShipmentReply({
        shipment,
        languageCode: responsePlan.languageCode,
        signature: sellerProfile?.signature,
        followUp,
      });
      if (isBuyerUpset(latestText)) {
        const apology =
          responsePlan.languageCode === "en"
            ? "Sorry for the inconvenience. "
            : "Désolé pour la gêne occasionnée. ";
        // Insert apology after Bonjour/Hi line when possible.
        reply = reply.replace(
          /^(Bonjour|Hi)([,.!]?\s*)/i,
          `$1$2${apology}`,
        );
      }
      return baseResult(common, {
        systemPrompt: "",
        userPrompt: `shipment:${shipment.kind}${followUp ? ":follow_up" : ""}${delivered ? ":delivered" : ""}`,
        reply,
        escalated: false,
        shipment,
      });
    }
  }

  // RAG — style only, filtered
  const similarRaw = latestText
    ? await deps.searchSimilarConversations({
        query: latestText,
        limit: options.similarLimit ?? 5,
      })
    : [];
  const similarConversations = filterSimilarForStyle({
    examples: similarRaw,
    buyerText: latestText,
    max: 1,
  });
  const similarSnippets = deps.toPromptSimilarSnippets(similarConversations);
  const styleHints =
    similarSnippets.length > 0
      ? similarSnippets
          .map((s, i) => `#${i + 1} (score ${s.score?.toFixed?.(3) ?? "?"})\n${s.summary}`)
          .join("\n\n")
      : undefined;

  const askMessages = currentAsk.messages.length
    ? currentAsk.messages
    : pendingBuyerMessages;
  const digest = formatConversationDigest(
    context.messages,
    6,
    sellerUsername,
  );
  const factPack = buildFactPack({
    plan: responsePlan,
    pendingBuyerMessages: askMessages,
    latestText,
    listing: context.listing,
    sellerProfile,
    shipment,
    orders: buyerOrders,
    threadDigest: digest,
    currentAsk: askNow,
  });

  const draftOnce = (repairNotes?: string) =>
    reasonThenReply({
      factPack,
      languageLabel: responsePlan.languageLabel,
      sellerProfile,
      conversationDigest: digest,
      styleHints,
      maxWords: responsePlan.maxWords,
      model,
      completeChat: deps.completeChat,
      ...(repairNotes ? { repairNotes } : {}),
    });

  let reasoned = await draftOnce();
  const buyerAbroad =
    buyerLikelyAbroad(latestText) || buyerLikelyAbroad(recentBuyerText);
  let reply = isAbstainReply(reasoned.reply) ? "" : reasoned.reply;
  if (reply && replyInventsFreeShipping(reply, context.listing, buyerAbroad)) {
    reply = formatShippingCostReply({
      listing: context.listing,
      languageCode: responsePlan.languageCode,
      signature: sellerProfile?.signature,
      askedFree: asksFreeShipping(latestText) || isShippingCostAsk(latestText),
      buyerAbroad,
    });
  }

  const qualityInput = {
    currentAsk: askNow,
    listing: context.listing,
    listingFactsText: factPack.listingFacts.join("\n"),
    messages: context.messages,
    selfUsernames: [sellerUsername],
    maxWords: responsePlan.maxWords,
  };
  let qa = assessReplyQuality({ ...qualityInput, reply });
  if (reply && !qa.ok) {
    reasoned = await draftOnce(formatRepairNotes(qa));
    reply = isAbstainReply(reasoned.reply) ? "" : reasoned.reply;
    if (reply && replyInventsFreeShipping(reply, context.listing, buyerAbroad)) {
      reply = formatShippingCostReply({
        listing: context.listing,
        languageCode: responsePlan.languageCode,
        signature: sellerProfile?.signature,
        askedFree: asksFreeShipping(latestText) || isShippingCostAsk(latestText),
        buyerAbroad,
      });
    }
    qa = assessReplyQuality({ ...qualityInput, reply });
    if (qa.block) {
      reply = "";
    }
  }

  const abstain = !reply;

  return {
    sellerProfile,
    listing: context.listing,
    listingError: context.listingError,
    conversation: {
      conversationId: context.conversationId,
      messages: context.messages,
      latestMessage: context.latestMessage,
    },
    similarConversations,
    responsePlan: abstain
      ? {
          ...responsePlan,
          intentLabel: `${responsePlan.intentLabel} (abstention)`,
          reasons: [
            ...responsePlan.reasons,
            qa.reasons.length
              ? `qualité: ${qa.reasons.join("; ")}`
              : "rien d'utile à envoyer",
          ],
        }
      : responsePlan,
    systemPrompt: reasoned.systemPrompt,
    userPrompt: reasoned.userPrompt,
    model,
    reply,
    escalated: false,
    ...(shipment ? { shipment } : {}),
    metadata: {
      languageCode: responsePlan.languageCode,
      languageLabel: responsePlan.languageLabel,
      listingItemId: context.listingItemId,
      messageCount: Math.min(12, context.messages.length),
      truncatedMessages: context.messages.length > 12,
      similarCount: similarConversations.length,
      sellerUsername,
      intent: responsePlan.intent,
      intentLabel: responsePlan.intentLabel,
      recommendedLength: responsePlan.recommendedLength,
      detailLevel: responsePlan.detailLevel,
      maxWords: responsePlan.maxWords,
      currentAskFingerprints: askFingerprints,
      currentAskText: askNow,
    },
    tokenUsage: reasoned.tokenUsage,
    latencyMs: Date.now() - startedAt,
  };
}
