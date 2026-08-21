/**
 * Build a public tracking URL for common carriers.
 */
export function buildTrackingUrl(
  trackingNumber: string,
  carrier?: string,
): string {
  const num = trackingNumber.trim();
  const c = (carrier ?? "").toLowerCase();

  if (
    c.includes("colissimo") ||
    c.includes("la poste") ||
    c.includes("chronopost") ||
    /\bfr\b/i.test(num) ||
    /^[A-Z]{2}\d{9}FR$/i.test(num)
  ) {
    if (c.includes("chronopost")) {
      return `https://www.chronopost.fr/tracking-no-cms/suivi-page?listeNumerosLT=${encodeURIComponent(num)}`;
    }
    return `https://www.laposte.fr/outils/suivre-vos-envois?code=${encodeURIComponent(num)}`;
  }

  if (c.includes("ups")) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(num)}`;
  }
  if (c.includes("fedex")) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(num)}`;
  }
  if (c.includes("dhl")) {
    return `https://www.dhl.com/fr-fr/home/tracking.html?tracking-id=${encodeURIComponent(num)}`;
  }
  if (c.includes("dpd") || c.includes("predict")) {
    return `https://www.dpd.fr/trace/${encodeURIComponent(num)}`;
  }
  if (c.includes("gls")) {
    return `https://gls-group.com/FR/fr/suivi-colis?match=${encodeURIComponent(num)}`;
  }
  if (c.includes("usps")) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(num)}`;
  }
  if (c.includes("royal mail")) {
    return `https://www.royalmail.com/track-your-item#/tracking-results/${encodeURIComponent(num)}`;
  }

  // Generic aggregator fallback
  return `https://t.17track.net/fr#nums=${encodeURIComponent(num)}`;
}
