import type { SellerProfileRow } from "../database/types.js";
import type { SellerProfile } from "../prompt/types.js";

/**
 * Maps DB row → Prompt Engine SellerProfile.
 * Prompt Engine must only consume this shape (no DB access).
 */
export function mapSellerProfileRowToPrompt(
  row: SellerProfileRow,
): SellerProfile {
  const customRules = (row.custom_instructions ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const negotiationText = `${row.negotiation_policy ?? ""} ${row.custom_instructions ?? ""}`;
  const negotiationAllowed = /ne négocie|aucune négociation|n['’]accepte jamais une remise|no negotiat/i.test(
    negotiationText,
  )
    ? false
    : undefined;

  return {
    id: row.id,
    sellerId: row.seller_id,
    displayName: row.display_name ?? undefined,
    languages: row.languages ?? [],
    style: row.response_style ?? undefined,
    tone: row.tone ?? undefined,
    shippingDelayText: row.shipping_policy ?? undefined,
    returnPolicyText: row.return_policy ?? undefined,
    refundPolicyText: row.refund_policy ?? undefined,
    negotiationPolicyText: row.negotiation_policy ?? undefined,
    negotiationAllowed,
    signature: row.signature ?? undefined,
    customInstructions: row.custom_instructions ?? undefined,
    customRules,
  };
}
