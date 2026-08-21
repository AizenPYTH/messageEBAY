import {
  resolveClientUsername,
  resolveSelfUsername,
} from "../conversations/messageSides.js";
import { findShipmentViaFulfillment } from "../ebay/fulfillmentApi.js";
import { getAuthenticatedUsername } from "../ebay/getUser.js";
import {
  findConversationSummary,
  getConversationMessages,
} from "../ebay/messageApi.js";
import {
  findBuyerTransaction,
  getItemTransactions,
} from "../ebay/transactionsApi.js";
import { lookupTrackingStatus } from "./lookupTrackingStatus.js";
import type { ShipmentResolution } from "./types.js";

export type ResolveShipmentInput = {
  conversationId: string;
  buyerUsername?: string;
  itemId?: string;
};

async function resolveBuyerAndItem(
  conversationId: string,
  hints: { buyerUsername?: string; itemId?: string },
): Promise<{ buyerUsername?: string; itemId?: string }> {
  let itemId = hints.itemId?.trim();
  let buyerUsername = hints.buyerUsername?.trim();

  const summary = await findConversationSummary(conversationId).catch(
    () => undefined,
  );
  if (!itemId) itemId = summary?.referenceId?.trim();

  if (!buyerUsername) {
    const authUsername = await getAuthenticatedUsername().catch(() => undefined);
    const detail = await getConversationMessages(
      conversationId,
      "FROM_MEMBERS",
    ).catch(() => null);
    const messages = detail?.messages ?? [];
    const selfUsername = resolveSelfUsername({
      authUsername,
      listingSeller: undefined,
    });
    const participants = messages.flatMap((m) => [
      m.senderUsername,
      m.recipientUsername,
    ]);
    buyerUsername = resolveClientUsername({
      selfUsername,
      otherPartyUsername: summary?.otherPartyUsername,
      participants,
    });
  }

  return {
    ...(buyerUsername ? { buyerUsername } : {}),
    ...(itemId ? { itemId } : {}),
  };
}

/**
 * Resolve shipment/tracking for a conversation.
 * Primary: Trading GetItemTransactions (existing token).
 * Fallback: Sell Fulfillment API (needs extra OAuth scope).
 */
export async function resolveShipment(
  input: ResolveShipmentInput,
): Promise<ShipmentResolution> {
  try {
    const { buyerUsername, itemId } = await resolveBuyerAndItem(
      input.conversationId,
      input,
    );

    if (!itemId) {
      return { kind: "missing_item" };
    }

    // 1) Trading API
    try {
      const transactions = await getItemTransactions(itemId);
      const tx = findBuyerTransaction(transactions, buyerUsername);
      if (tx) {
        if (tx.trackingNumber?.trim()) {
          const lookup = await lookupTrackingStatus({
            trackingNumber: tx.trackingNumber,
            carrier: tx.carrier,
          });
          return {
            kind: "shipped",
            trackingNumber: tx.trackingNumber.trim(),
            carrier: tx.carrier ?? lookup.product,
            product: lookup.product,
            shippedDate: tx.shippedTime,
            trackingUrl: lookup.trackingUrl,
            statusLabel: lookup.statusLabel,
            detailMessage: lookup.detailMessage,
            trackingStatus: lookup.status,
            lastEventAt: lookup.events?.[0]?.date,
            orderId: tx.orderId,
            source: "trading",
            lookupSource: lookup.source,
          };
        }
        // Transaction exists but no tracking yet → not shipped / not labeled
        return {
          kind: "not_shipped",
          orderId: tx.orderId,
          shippedDate: tx.shippedTime,
          source: "trading",
        };
      }
    } catch {
      // Fall through to fulfillment.
    }

    // 2) Fulfillment API (optional scope)
    const fulfillment = await findShipmentViaFulfillment({
      buyerUsername,
      itemId,
    });
    if (fulfillment) {
      if (fulfillment.trackingNumber?.trim()) {
        const lookup = await lookupTrackingStatus({
          trackingNumber: fulfillment.trackingNumber,
          carrier: fulfillment.carrier,
        });
        return {
          kind: "shipped",
          trackingNumber: fulfillment.trackingNumber.trim(),
          carrier: fulfillment.carrier ?? lookup.product,
          product: lookup.product,
          shippedDate: fulfillment.shippedDate,
          trackingUrl: lookup.trackingUrl,
          statusLabel: lookup.statusLabel,
          detailMessage: lookup.detailMessage,
          trackingStatus: lookup.status,
          lastEventAt: lookup.events?.[0]?.date,
          orderId: fulfillment.orderId,
          source: "fulfillment",
          lookupSource: lookup.source,
        };
      }
      return {
        kind: "not_shipped",
        orderId: fulfillment.orderId,
        source: "fulfillment",
      };
    }

    return { kind: "order_not_found" };
  } catch (error: unknown) {
    return {
      kind: "error",
      error: error instanceof Error ? error.message : "Erreur suivi",
    };
  }
}
