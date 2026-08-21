import {
  classifySellerCase,
  type SellerCaseKind,
} from "../analysis/sellerCase.js";
import type { ResponsePlan } from "../analysis/types.js";
import {
  isOwnListing,
  latestIncomingBuyerText,
} from "../conversations/messageSides.js";
import type { EbayMessage } from "../ebay/messageApi.js";
import {
  hasOpenAlert,
  insertSellerAlert,
  type SellerAlertRow,
} from "../database/repositories/sellerAlerts.js";

export type EnsureAlertsInput = {
  userId?: string | null;
  conversationId: string;
  buyerUsername?: string | null;
  listingTitle?: string | null;
  listingPrice?: string | null;
  messages: EbayMessage[];
  responsePlan: ResponsePlan;
  latestBuyerText?: string | null;
  sellerUsername?: string | null;
  /** Logged-in eBay username (token). */
  authUsername?: string | null;
  /** Seller of the listing linked to the conversation. */
  listingSellerUsername?: string | null;
};

export type EnsureAlertsResult = {
  escalationAlert: SellerAlertRow | null;
  /** @deprecated kept for API compat — digests replaced by case alerts */
  digestAlert: SellerAlertRow | null;
  caseAlert: SellerAlertRow | null;
};

function resolveCase(input: EnsureAlertsInput): {
  kind: SellerCaseKind;
  summaryFr: string;
} | null {
  // Always classify from message + price + history (actionable summaries).
  const classified = classifySellerCase({
    latestText: input.latestBuyerText,
    messages: input.messages,
    sellerUsername: input.sellerUsername ?? undefined,
    listingPrice: input.listingPrice,
  });
  if (classified.kind !== "none") {
    return { kind: classified.kind, summaryFr: classified.summaryFr };
  }

  // Fallback if pipeline already tagged a case we don't re-detect.
  if (
    input.responsePlan.escalationReason &&
    input.responsePlan.escalationLabel &&
    input.responsePlan.escalationReason !== "none"
  ) {
    return {
      kind: input.responsePlan.escalationReason as SellerCaseKind,
      summaryFr: input.responsePlan.escalationLabel,
    };
  }

  return null;
}

/**
 * Persist actionable case alerts for Rapports.
 * Idempotent for open alerts of the same type on a conversation.
 * No more "dernier message" digests.
 * Skips conversations where we are the buyer (not the listing seller).
 */
export async function ensureSellerAlerts(
  input: EnsureAlertsInput,
): Promise<EnsureAlertsResult> {
  const auth = input.authUsername ?? input.sellerUsername;
  const listingSeller = input.listingSellerUsername;
  // If we know the listing seller and it's not us, this is a purchase thread.
  if (
    listingSeller?.trim() &&
    auth?.trim() &&
    !isOwnListing({ authUsername: auth, listingSeller })
  ) {
    return { escalationAlert: null, digestAlert: null, caseAlert: null };
  }

  // Never classify our own outgoing message as a client request.
  const incoming =
    input.latestBuyerText?.trim() ||
    latestIncomingBuyerText({
      messages: input.messages,
      selfUsername: auth ?? undefined,
    });
  if (!incoming) {
    return { escalationAlert: null, digestAlert: null, caseAlert: null };
  }

  const sellerCase = resolveCase({ ...input, latestBuyerText: incoming });
  if (!sellerCase) {
    return { escalationAlert: null, digestAlert: null, caseAlert: null };
  }

  // Asking for packaging photos is automatic — alert only when photos arrive.
  if (sellerCase.kind === "exterior_packaging_damage") {
    return { escalationAlert: null, digestAlert: null, caseAlert: null };
  }

  const already = await hasOpenAlert(input.conversationId, sellerCase.kind);
  if (already) {
    return { escalationAlert: null, digestAlert: null, caseAlert: null };
  }

  const row = await insertSellerAlert({
    userId: input.userId,
    conversationId: input.conversationId,
    buyerUsername: input.buyerUsername,
    listingTitle: input.listingTitle,
    alertType: sellerCase.kind,
    reason: sellerCase.summaryFr,
    buyerMessage: incoming,
    messageCount: input.messages.length,
  });

  const isIntervention =
    input.responsePlan.needsSellerIntervention ||
    sellerCase.kind !== "partial_refund_offer";

  return {
    escalationAlert: isIntervention ? row : null,
    digestAlert: null,
    caseAlert: row,
  };
}
