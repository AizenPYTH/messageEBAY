export type CarrierFamily =
  | "laposte"
  | "chronopost"
  | "ups"
  | "fedex"
  | "dhl"
  | "dpd"
  | "gls"
  | "unknown";

/**
 * Guess carrier family from eBay carrier string + tracking number shape.
 */
export function detectCarrierFamily(
  trackingNumber: string,
  carrierHint?: string,
): CarrierFamily {
  const num = trackingNumber.trim().toUpperCase();
  const hint = (carrierHint ?? "").toLowerCase();

  if (hint.includes("chrono")) return "chronopost";
  if (
    hint.includes("colissimo") ||
    hint.includes("la poste") ||
    hint.includes("laposte") ||
    hint.includes("courrier")
  ) {
    return "laposte";
  }
  if (hint.includes("ups")) return "ups";
  if (hint.includes("fedex")) return "fedex";
  if (hint.includes("dhl")) return "dhl";
  if (hint.includes("dpd")) return "dpd";
  if (hint.includes("gls")) return "gls";

  // Chronopost skybills are often numeric (longer) or start with specific patterns.
  if (/^\d{10,15}$/.test(num) && hint.includes("chrono")) return "chronopost";

  // Colissimo / La Poste classic: 2 letters + digits + FR, or 6A/6C/2C…
  if (
    /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(num) ||
    /^6[A-Z]\d+/.test(num) ||
    /^2[A-Z]\d+/.test(num) ||
    /^[A-Z]{1}\d{11,13}$/.test(num)
  ) {
    return "laposte";
  }

  if (num.endsWith("FR") && /^[A-Z0-9]{10,}$/.test(num)) return "laposte";

  return "unknown";
}
