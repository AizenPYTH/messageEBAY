import { config } from "../config.js";

export type FulfillmentShipment = {
  orderId: string;
  buyerUsername?: string;
  itemId?: string;
  trackingNumber?: string;
  carrier?: string;
  shippedDate?: string;
  orderFulfillmentStatus?: string;
};

function fulfillmentBase(): string {
  return config.env === "production"
    ? "https://api.ebay.com/sell/fulfillment/v1"
    : "https://api.sandbox.ebay.com/sell/fulfillment/v1";
}

function authHeaders(): HeadersInit {
  if (!config.accessToken) {
    throw new Error("EBAY_USER_ACCESS_TOKEN manquant");
  }
  return {
    Authorization: `Bearer ${config.accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

type OrderRaw = {
  orderId?: string;
  orderFulfillmentStatus?: string;
  buyer?: { username?: string };
  lineItems?: Array<{
    legacyItemId?: string;
  }>;
};

type ShippingFulfillmentRaw = {
  shipmentTrackingNumber?: string;
  shippingCarrierCode?: string;
  shippedDate?: string;
};

/**
 * Optional path — requires sell.fulfillment.readonly OAuth scope.
 * Returns null on 403/scope errors so Trading API can remain primary.
 */
export async function findShipmentViaFulfillment(input: {
  buyerUsername?: string;
  itemId?: string;
}): Promise<FulfillmentShipment | null> {
  try {
    const url = new URL(`${fulfillmentBase()}/order`);
    url.searchParams.set("limit", "50");
    const response = await fetch(url, { headers: authHeaders() });
    if (response.status === 401 || response.status === 403) {
      return null;
    }
    const data = (await response.json()) as {
      orders?: OrderRaw[];
    };
    if (!response.ok) return null;

    const orders = data.orders ?? [];
    const buyer = input.buyerUsername?.trim().toLowerCase();
    const itemId = input.itemId?.trim();

    const matches = orders.filter((order) => {
      const orderBuyer = order.buyer?.username?.trim().toLowerCase();
      if (buyer && orderBuyer && orderBuyer !== buyer) return false;
      if (!itemId) return true;
      return (order.lineItems ?? []).some(
        (li) => li.legacyItemId?.trim() === itemId,
      );
    });

    const order = matches[0];
    if (!order?.orderId) return null;

    const fulfillUrl = `${fulfillmentBase()}/order/${encodeURIComponent(order.orderId)}/shipping_fulfillment`;
    const fulfillRes = await fetch(fulfillUrl, { headers: authHeaders() });
    if (!fulfillRes.ok) {
      return {
        orderId: order.orderId,
        buyerUsername: order.buyer?.username,
        itemId,
        orderFulfillmentStatus: order.orderFulfillmentStatus,
      };
    }

    const fulfillData = (await fulfillRes.json()) as {
      fulfillments?: ShippingFulfillmentRaw[];
    };
    const fulfillment = fulfillData.fulfillments?.[0];

    return {
      orderId: order.orderId,
      buyerUsername: order.buyer?.username,
      itemId,
      orderFulfillmentStatus: order.orderFulfillmentStatus,
      trackingNumber: fulfillment?.shipmentTrackingNumber,
      carrier: fulfillment?.shippingCarrierCode,
      shippedDate: fulfillment?.shippedDate,
    };
  } catch {
    return null;
  }
}
