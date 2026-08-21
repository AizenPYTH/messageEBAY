export type ShipmentResolution = {
  kind:
    | "not_shipped"
    | "shipped"
    | "order_not_found"
    | "missing_item"
    | "error";
  trackingNumber?: string;
  carrier?: string;
  product?: string;
  shippedDate?: string;
  trackingUrl?: string;
  /** Short status (LIVRE, En transit…) */
  statusLabel?: string;
  /** Human detail like on eBay / La Poste tracking page */
  detailMessage?: string;
  trackingStatus?:
    | "in_transit"
    | "delivered"
    | "out_for_delivery"
    | "info_received"
    | "unknown";
  /** ISO date of the latest carrier event (for stale detection). */
  lastEventAt?: string;
  orderId?: string;
  source?: "trading" | "fulfillment";
  lookupSource?: string;
  error?: string;
};
