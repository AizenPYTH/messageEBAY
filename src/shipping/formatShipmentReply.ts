import type { ShipmentResolution } from "./types.js";

const STALE_DAYS = 7;

function formatDate(iso?: string, locale = "fr-FR"): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

/** True when last tracking event (or ship date) is older than 7 days and not delivered. */
export function isTrackingStale(
  shipment: ShipmentResolution,
  nowMs: number = Date.now(),
): boolean {
  if (shipment.kind !== "shipped") return false;
  if (shipment.trackingStatus === "delivered") return false;
  const ref = shipment.lastEventAt || shipment.shippedDate;
  if (!ref) return false;
  const t = new Date(ref).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t >= STALE_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Deterministic seller reply from shipment facts — short, human, no LLM tone.
 */
export function formatShipmentReply(input: {
  shipment: ShipmentResolution;
  languageCode?: string;
  signature?: string;
  /** Buyer already asked about tracking earlier in the thread. */
  followUp?: boolean;
  nowMs?: number;
}): string {
  const lang = input.languageCode === "en" ? "en" : "fr";
  const sig = input.signature?.trim();
  const s = input.shipment;
  const stale = Boolean(input.followUp) && isTrackingStale(s, input.nowMs);
  const dateFr = formatDate(s.shippedDate, "fr-FR");
  const dateEn = formatDate(s.shippedDate, "en-GB");

  let body: string;

  if (lang === "en") {
    if (s.kind === "not_shipped") {
      body = input.followUp
        ? "Hi, yes we're handling shipment of your order. I'll send the tracking as soon as it goes out."
        : "Hi, the parcel hasn't shipped yet. I'll send the tracking as soon as it goes out.";
    } else if (s.kind === "shipped" && s.trackingNumber) {
      if (s.trackingStatus === "delivered") {
        // Never push INR / dispute on first contact — delivery is the fact.
        body = input.followUp
          ? "Hi, tracking still shows delivered. Please check again with the caretaker, neighbours, or pickup point. If nothing turns up after that, tell me and we'll see the next step."
          : "Hi, tracking shows your parcel as delivered. It may have been left with a caretaker, a neighbour, or at a pickup point — could you check on that side?";
      } else if (stale) {
        body =
          "Hi, tracking hasn't moved for a week. I'll check with the carrier and get back to you.";
      } else {
        body = dateEn
          ? `Hi, the parcel was sent on ${dateEn}. It should start moving on tracking soon.\nTracking: ${s.trackingNumber}`
          : `Hi, the parcel has been sent. It should start moving on tracking soon.\nTracking: ${s.trackingNumber}`;
      }
    } else if (s.kind === "order_not_found" || s.kind === "missing_item") {
      body = "Hi, I'm checking this order and will get back to you shortly.";
    } else {
      body = "Hi, I'm checking the shipment and will update you shortly.";
    }
  } else if (s.kind === "not_shipped") {
    body = input.followUp
      ? "Bonjour, oui on s'occupe de l'expédition de votre commande. Je vous envoie le suivi dès l'envoi."
      : "Bonjour, le colis n'est pas encore parti. Je vous envoie le suivi dès l'expédition.";
  } else if (s.kind === "shipped" && s.trackingNumber) {
    if (s.trackingStatus === "delivered") {
      // Jamais « ouvrez un litige objet non reçu » d’emblée.
      body = input.followUp
        ? "Bonjour, le suivi indique toujours une livraison. Merci de revérifier auprès du gardien, des voisins ou du point relais. Si après ça rien n'a été trouvé, dites-le-moi et on verra la suite."
        : "Bonjour, le suivi indique que votre colis a été livré. Il a peut-être été remis à un gardien, un voisin, ou déposé en point relais — pouvez-vous vérifier de ce côté ?";
    } else if (stale) {
      body =
        "Bonjour, le suivi n'a pas bougé depuis une semaine. Je vérifie auprès du transporteur et je vous recontacte.";
    } else {
      body = dateFr
        ? `Bonjour, le colis a été envoyé le ${dateFr}. Il devrait bientôt bouger sur le suivi.\nSuivi : ${s.trackingNumber}`
        : `Bonjour, le colis a bien été envoyé. Il devrait bientôt bouger sur le suivi.\nSuivi : ${s.trackingNumber}`;
    }
  } else if (s.kind === "order_not_found" || s.kind === "missing_item") {
    body = "Bonjour, je vérifie cette commande et je vous recontacte rapidement.";
  } else {
    body = "Bonjour, je vérifie l'expédition et je vous recontacte rapidement.";
  }

  if (sig) {
    return `${body}\n\n${sig}`;
  }
  return body;
}
