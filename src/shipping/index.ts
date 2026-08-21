export { isTrackingRequest } from "./detectTracking.js";
export { resolveShipment } from "./resolveShipment.js";
export { formatShipmentReply, isTrackingStale } from "./formatShipmentReply.js";
export { isTrackingFollowUp } from "./trackingFollowUp.js";
export { buildTrackingUrl } from "./trackingUrls.js";
export {
  isShippingCostAsk,
  asksFreeShipping,
  buyerLikelyAbroad,
  formatShippingCostReply,
  replyInventsFreeShipping,
} from "./shippingCost.js";
export {
  isDeliveryEtaAsk,
  isDispatchAsk,
  detectDestination,
  formatShippingDelayReply,
} from "./deliveryEta.js";
export type { ShipmentResolution } from "./types.js";
export type { DeliveryDestination } from "./deliveryEta.js";
