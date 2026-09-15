import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatShipmentReply,
  isTrackingStale,
} from "./formatShipmentReply.js";

describe("formatShipmentReply", () => {
  it("says not shipped when no tracking", () => {
    const text = formatShipmentReply({
      shipment: { kind: "not_shipped" },
      languageCode: "fr",
    });
    assert.match(text, /pas encore parti/i);
  });

  it("on not-shipped follow-up, confirms we will ship the order", () => {
    const text = formatShipmentReply({
      shipment: { kind: "not_shipped" },
      languageCode: "fr",
      followUp: true,
    });
    assert.match(text, /expédition de votre commande/i);
    assert.doesNotMatch(text, /en stock|voici le lien/i);
  });

  it("keeps first reply short: sent date + should move", () => {
    const text = formatShipmentReply({
      shipment: {
        kind: "shipped",
        trackingNumber: "88000232272779Y",
        shippedDate: "2026-08-04T10:00:00+02:00",
        trackingStatus: "in_transit",
        lastEventAt: "2026-08-04T21:55:10+02:00",
        statusLabel: "En transit",
        detailMessage: "Long AI-looking status that must not appear",
        trackingUrl: "https://example.com/track",
      },
      languageCode: "fr",
      signature: "Marc",
    });
    assert.match(text, /envoyé le/i);
    assert.match(text, /devrait bientôt bouger/i);
    assert.match(text, /88000232272779Y/);
    assert.doesNotMatch(text, /Long AI-looking/);
    assert.doesNotMatch(text, /Suivi en ligne/);
    assert.match(text, /Marc$/);
  });

  it("uses stale follow-up reply after a week without movement", () => {
    const text = formatShipmentReply({
      shipment: {
        kind: "shipped",
        trackingNumber: "88000232272779Y",
        shippedDate: "2026-07-20T10:00:00+02:00",
        trackingStatus: "in_transit",
        lastEventAt: "2026-07-20T21:00:00+02:00",
      },
      languageCode: "fr",
      followUp: true,
      nowMs: Date.parse("2026-08-04T12:00:00+02:00"),
    });
    assert.match(text, /pas bougé depuis une semaine/i);
    assert.match(text, /transporteur/i);
  });

  it("does not use stale reply on first ask", () => {
    const text = formatShipmentReply({
      shipment: {
        kind: "shipped",
        trackingNumber: "88000232272779Y",
        shippedDate: "2026-07-20T10:00:00+02:00",
        lastEventAt: "2026-07-20T21:00:00+02:00",
        trackingStatus: "in_transit",
      },
      languageCode: "fr",
      followUp: false,
      nowMs: Date.parse("2026-08-04T12:00:00+02:00"),
    });
    assert.match(text, /devrait bientôt bouger/i);
    assert.doesNotMatch(text, /une semaine/i);
  });

  it("says delivered and suggests caretaker/neighbour, never dispute", () => {
    const text = formatShipmentReply({
      shipment: {
        kind: "shipped",
        trackingNumber: "88000232272779Y",
        trackingStatus: "delivered",
      },
      languageCode: "fr",
    });
    assert.match(text, /a été livré/i);
    assert.match(text, /gardien|voisin|point relais/i);
    assert.doesNotMatch(text, /litige|objet non re[cç]u|paypal/i);
  });

  it("on delivered follow-up, still no dispute push", () => {
    const text = formatShipmentReply({
      shipment: {
        kind: "shipped",
        trackingNumber: "88000232272779Y",
        trackingStatus: "delivered",
      },
      languageCode: "fr",
      followUp: true,
    });
    assert.match(text, /livraison|livré/i);
    assert.match(text, /on verra la suite/i);
    assert.doesNotMatch(text, /litige|objet non re[cç]u|paypal/i);
  });
});

describe("isTrackingStale", () => {
  it("is stale after 7 days without delivery", () => {
    assert.equal(
      isTrackingStale(
        {
          kind: "shipped",
          trackingNumber: "x",
          lastEventAt: "2026-07-20T00:00:00Z",
          trackingStatus: "in_transit",
        },
        Date.parse("2026-08-04T00:00:00Z"),
      ),
      true,
    );
  });

  it("is not stale when delivered", () => {
    assert.equal(
      isTrackingStale(
        {
          kind: "shipped",
          trackingNumber: "x",
          lastEventAt: "2026-07-01T00:00:00Z",
          trackingStatus: "delivered",
        },
        Date.parse("2026-08-04T00:00:00Z"),
      ),
      false,
    );
  });
});
