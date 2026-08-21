import type { UpsertSellerProfileInput } from "../database/types.js";
import {
  SNOWOLF_CUSTOM_INSTRUCTIONS,
  SNOWOLF_NEGOTIATION_POLICY,
  SNOWOLF_REFUND_POLICY,
  SNOWOLF_RESPONSE_STYLE,
  SNOWOLF_RETURN_POLICY,
  SNOWOLF_SHIPPING_POLICY,
  SNOWOLF_SIGNATURE,
  SNOWOLF_TONE,
} from "./snowolfPlaybook.js";

/** Default profile seed — editable later via web UI / CLI. */
export function buildDefaultSellerProfileInput(
  sellerId: string,
  displayName: string,
): UpsertSellerProfileInput {
  return {
    sellerId,
    displayName,
    languages: ["fr", "en"],
    responseStyle: SNOWOLF_RESPONSE_STYLE,
    shippingPolicy: SNOWOLF_SHIPPING_POLICY,
    returnPolicy: SNOWOLF_RETURN_POLICY,
    refundPolicy: SNOWOLF_REFUND_POLICY,
    negotiationPolicy: SNOWOLF_NEGOTIATION_POLICY,
    tone: SNOWOLF_TONE,
    signature: SNOWOLF_SIGNATURE,
    customInstructions: SNOWOLF_CUSTOM_INSTRUCTIONS,
  };
}
