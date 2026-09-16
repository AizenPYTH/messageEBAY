/**
 * The seller's orders (Sell Fulfillment API).
 *
 * "Avez-vous des retours par rapport à ma commande ?" is answerable only if we
 * know what the buyer actually bought and where it is. Without this, the reply
 * had nothing to work from and reached for the catalogue instead.
 *
 * Read-only, and optional: the API needs the sell.fulfillment.readonly scope,
 * so every failure returns an empty list rather than throwing. A missing order
 * makes the reply vaguer, never wrong.
 */

import { config } from "../config.js";

export type OrderLineItem = {
  lineItemId?: string;
  itemId?: string;
  title?: string;
  quantity?: number;
};

export type SellerOrder = {
  orderId: string;
  buyerUsername?: string;
  creationDate?: string;
  lastModifiedDate?: string;
  fulfillmentStatus?: string;
  paymentStatus?: string;
  /** "CANCELED" / "CANCEL_REQUESTED" / "NONE_REQUESTED" */
  cancelState?: string;
  total?: string;
  currency?: string;
  lineItems: OrderLineItem[];
  trackingNumbers: string[];
};

function fulfillmentBase(): string {
  return config.env === "production"
    ? "https://api.ebay.com/sell/fulfillment/v1"
    : "https://api.sandbox.ebay.com/sell/fulfillment/v1";
}

type OrderRaw = {
  orderId?: string;
  creationDate?: string;
  lastModifiedDate?: string;
  orderFulfillmentStatus?: string;
  orderPaymentStatus?: string;
  cancelStatus?: { cancelState?: string };
  pricingSummary?: { total?: { value?: string; currency?: string } };
  buyer?: { username?: string };
  lineItems?: Array<{
    lineItemId?: string;
    legacyItemId?: string;
    title?: string;
    quantity?: number;
  }>;
  fulfillmentStartInstructions?: unknown;
  fulfillmentHrefs?: string[];
};

function toOrder(raw: OrderRaw): SellerOrder | null {
  if (!raw.orderId) return null;
  return {
    orderId: raw.orderId,
    ...(raw.buyer?.username ? { buyerUsername: raw.buyer.username } : {}),
    ...(raw.creationDate ? { creationDate: raw.creationDate } : {}),
    ...(raw.lastModifiedDate ? { lastModifiedDate: raw.lastModifiedDate } : {}),
    ...(raw.orderFulfillmentStatus
      ? { fulfillmentStatus: raw.orderFulfillmentStatus }
      : {}),
    ...(raw.orderPaymentStatus ? { paymentStatus: raw.orderPaymentStatus } : {}),
    ...(raw.cancelStatus?.cancelState
      ? { cancelState: raw.cancelStatus.cancelState }
      : {}),
    ...(raw.pricingSummary?.total?.value
      ? { total: raw.pricingSummary.total.value }
      : {}),
    ...(raw.pricingSummary?.total?.currency
      ? { currency: raw.pricingSummary.total.currency }
      : {}),
    lineItems: (raw.lineItems ?? []).map((line) => ({
      ...(line.lineItemId ? { lineItemId: line.lineItemId } : {}),
      ...(line.legacyItemId ? { itemId: line.legacyItemId } : {}),
      ...(line.title ? { title: line.title } : {}),
      ...(typeof line.quantity === "number" ? { quantity: line.quantity } : {}),
    })),
    trackingNumbers: [],
  };
}

/**
 * Recent orders, newest first. Returns [] on any API or scope problem.
 */
export async function listRecentOrders(options?: {
  limit?: number;
  daysBack?: number;
  accessToken?: string;
}): Promise<SellerOrder[]> {
  const token = options?.accessToken ?? config.accessToken;
  if (!token) return [];

  const since = new Date(
    Date.now() - (options?.daysBack ?? 90) * 24 * 60 * 60 * 1000,
  ).toISOString();

  try {
    const url = new URL(`${fulfillmentBase()}/order`);
    url.searchParams.set("limit", String(Math.min(200, options?.limit ?? 100)));
    url.searchParams.set("filter", `creationdate:[${since}..]`);

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { orders?: OrderRaw[] };
    return (data.orders ?? [])
      .map(toOrder)
      .filter((order): order is SellerOrder => order !== null)
      .sort((a, b) =>
        (b.creationDate ?? "").localeCompare(a.creationDate ?? ""),
      );
  } catch {
    return [];
  }
}

/** Orders placed by one buyer, newest first. */
export async function findBuyerOrders(input: {
  buyerUsername?: string;
  itemId?: string;
  limit?: number;
  /** Test seam — supply the order list instead of calling eBay. */
  load?: () => Promise<SellerOrder[]>;
}): Promise<SellerOrder[]> {
  const buyer = input.buyerUsername?.trim().toLowerCase();
  if (!buyer && !input.itemId) return [];
  const orders = await (input.load ?? (() => listRecentOrders({ limit: 200 })))();
  return orders
    .filter((order) => {
      if (buyer && order.buyerUsername?.trim().toLowerCase() === buyer) {
        return true;
      }
      return Boolean(
        input.itemId && order.lineItems.some((l) => l.itemId === input.itemId),
      );
    })
    .slice(0, input.limit ?? 5);
}

/** One short French line per order, for the fact pack. */
export function describeOrder(order: SellerOrder): string {
  const date = order.creationDate?.slice(0, 10);
  const what = order.lineItems
    .map((line) =>
      [line.title, line.quantity && line.quantity > 1 ? `×${line.quantity}` : null]
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean)
    .join(", ");
  const status = [
    order.paymentStatus === "PAID" ? "payée" : order.paymentStatus,
    order.fulfillmentStatus === "FULFILLED"
      ? "expédiée"
      : order.fulfillmentStatus === "NOT_STARTED"
        ? "pas encore expédiée"
        : order.fulfillmentStatus,
    order.cancelState && order.cancelState !== "NONE_REQUESTED"
      ? `annulation : ${order.cancelState}`
      : null,
  ]
    .filter(Boolean)
    .join(", ");

  return [
    `Commande ${order.orderId}`,
    date ? `du ${date}` : null,
    what ? `: ${what}` : null,
    status ? `— ${status}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
