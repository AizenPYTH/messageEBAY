import { detectCarrierFamily } from "./carriers/detectCarrier.js";
import { trackViaChronopostSoap } from "./carriers/chronopostSoap.js";
import {
  trackViaLaposteOkapi,
  trackViaLaposteSsu,
} from "./carriers/laposteSsu.js";
import { buildTrackingUrl } from "./trackingUrls.js";

export type TrackingLookupResult = {
  status: "in_transit" | "delivered" | "out_for_delivery" | "info_received" | "unknown";
  statusLabel: string;
  /** Detailed last event message (what eBay shows under tracking). */
  detailMessage: string;
  trackingUrl: string;
  product?: string;
  events?: Array<{ date?: string; label: string }>;
  source: "laposte_ssu" | "laposte_okapi" | "chronopost" | "link_only";
};

function classifyFromText(text: string): TrackingLookupResult["status"] {
  const t = text.toLowerCase();
  if (/livr[eé]|delivered|remise au destinataire|distribut/.test(t)) {
    return "delivered";
  }
  if (/en cours de livraison|out for delivery|aujourd'?hui|premi[eè]re pr[eé]sentation/.test(t)) {
    return "out_for_delivery";
  }
  if (/en transit|in transit|achemin|envoi|exp[eé]di|pris en charge|d[eé]part|arriv/.test(t)) {
    return "in_transit";
  }
  if (/information|annonc|label|prise en compte|pr[eé]par/.test(t)) {
    return "info_received";
  }
  return "unknown";
}

/**
 * Live carrier lookup — same idea as clicking tracking on eBay for FR carriers.
 */
export async function lookupTrackingStatus(input: {
  trackingNumber: string;
  carrier?: string;
}): Promise<TrackingLookupResult> {
  const trackingUrl = buildTrackingUrl(input.trackingNumber, input.carrier);
  const family = detectCarrierFamily(input.trackingNumber, input.carrier);
  const okapiKey = process.env.LAPOSTE_OKAPI_KEY?.trim();

  // 1) Official Okapi key if configured (Colissimo + Chronopost + courrier)
  if (okapiKey && (family === "laposte" || family === "chronopost" || family === "unknown")) {
    const okapi = await trackViaLaposteOkapi(input.trackingNumber, okapiKey);
    if (okapi.ok) {
      return {
        status: classifyFromText(
          `${okapi.statusLabel} ${okapi.lastEventLabel}`,
        ),
        statusLabel: okapi.statusLabel,
        detailMessage: okapi.lastEventLabel,
        trackingUrl: okapi.trackingUrl,
        product: okapi.product,
        events: okapi.events,
        source: "laposte_okapi",
      };
    }
  }

  // 2) La Poste website flow (same as clicking the tracking page)
  if (family === "laposte" || family === "chronopost" || family === "unknown") {
    const ssu = await trackViaLaposteSsu(input.trackingNumber);
    if (ssu.ok) {
      return {
        status: classifyFromText(`${ssu.statusLabel} ${ssu.lastEventLabel}`),
        statusLabel: ssu.statusLabel,
        detailMessage: ssu.lastEventLabel,
        trackingUrl: ssu.trackingUrl,
        product: ssu.product,
        events: ssu.events,
        source: "laposte_ssu",
      };
    }
  }

  // 3) Chronopost SOAP
  if (family === "chronopost" || family === "unknown") {
    const chrono = await trackViaChronopostSoap(input.trackingNumber);
    if (chrono.ok) {
      return {
        status: classifyFromText(chrono.lastEventLabel),
        statusLabel: chrono.statusLabel,
        detailMessage: chrono.lastEventLabel,
        trackingUrl: chrono.trackingUrl,
        events: chrono.events,
        source: "chronopost",
      };
    }
  }

  return {
    status: "unknown",
    statusLabel: "Suivi disponible",
    detailMessage: "Consultez le lien de suivi pour le détail du trajet.",
    trackingUrl,
    source: "link_only",
  };
}
