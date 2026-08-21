import { config } from "../config.js";
import { firstTag } from "./xml.js";

export type TransactionShipment = {
  itemId: string;
  buyerUsername?: string;
  transactionId?: string;
  orderId?: string;
  paidTime?: string;
  shippedTime?: string;
  trackingNumber?: string;
  carrier?: string;
};

function tradingEndpoint(): string {
  return config.env === "production"
    ? "https://api.ebay.com/ws/api.dll"
    : "https://api.sandbox.ebay.com/ws/api.dll";
}

function extractBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}>`, "gi");
  return xml.match(re) ?? [];
}

/**
 * Load recent transactions for a listing via Trading API GetItemTransactions.
 * Works with the existing user IAF token (no extra OAuth scope).
 */
export async function getItemTransactions(
  itemId: string,
  options?: { numberOfDays?: number; siteId?: string },
): Promise<TransactionShipment[]> {
  if (!config.accessToken) {
    throw new Error("EBAY_USER_ACCESS_TOKEN manquant");
  }

  const days = options?.numberOfDays ?? 90;
  const siteId = options?.siteId ?? "71";

  const body = `<?xml version="1.0" encoding="utf-8"?>
<GetItemTransactionsRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <ErrorLanguage>en_US</ErrorLanguage>
  <ItemID>${itemId}</ItemID>
  <NumberOfDays>${days}</NumberOfDays>
  <DetailLevel>ReturnAll</DetailLevel>
  <IncludeFinalValueFee>false</IncludeFinalValueFee>
</GetItemTransactionsRequest>`;

  const response = await fetch(tradingEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "text/xml",
      "X-EBAY-API-CALL-NAME": "GetItemTransactions",
      "X-EBAY-API-SITEID": siteId,
      "X-EBAY-API-COMPATIBILITY-LEVEL": "1271",
      "X-EBAY-API-IAF-TOKEN": config.accessToken,
    },
    body,
  });

  const xml = await response.text();
  const ack = firstTag(xml, "Ack");
  if (!response.ok || (ack !== "Success" && ack !== "Warning")) {
    const shortMsg = firstTag(xml, "ShortMessage");
    const longMsg = firstTag(xml, "LongMessage");
    throw new Error(
      longMsg || shortMsg || `GetItemTransactions failed (HTTP ${response.status})`,
    );
  }

  const transactions = extractBlocks(xml, "Transaction");
  return transactions.map((block) => {
    const trackingNumber =
      firstTag(block, "ShipmentTrackingNumber") ||
      firstTag(block, "TrackingNumber");
    const carrier =
      firstTag(block, "ShippingCarrierUsed") ||
      firstTag(block, "ShippingCarrier");

    return {
      itemId: firstTag(block, "ItemID") || itemId,
      buyerUsername: firstTag(block, "UserID"),
      transactionId: firstTag(block, "TransactionID"),
      orderId: firstTag(block, "OrderLineItemID") || firstTag(block, "OrderID"),
      paidTime: firstTag(block, "PaidTime"),
      shippedTime: firstTag(block, "ShippedTime"),
      ...(trackingNumber ? { trackingNumber } : {}),
      ...(carrier ? { carrier } : {}),
    };
  });
}

export function findBuyerTransaction(
  transactions: TransactionShipment[],
  buyerUsername: string | undefined,
): TransactionShipment | undefined {
  if (!transactions.length) return undefined;
  if (!buyerUsername?.trim()) {
    // Only safe when a single transaction exists for the item.
    return transactions.length === 1 ? transactions[0] : undefined;
  }
  const needle = buyerUsername.trim().toLowerCase();
  return transactions.find(
    (t) => t.buyerUsername?.trim().toLowerCase() === needle,
  );
}
