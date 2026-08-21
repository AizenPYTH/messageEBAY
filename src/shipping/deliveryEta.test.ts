import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectDestination,
  formatShippingDelayReply,
  isDeliveryEtaAsk,
} from "./deliveryEta.js";
import type { ListingDetails } from "../ebay/tradingApi.js";

describe("deliveryEta", () => {
  it("detects Italy delivery ETA asks", () => {
    assert.equal(
      isDeliveryEtaAsk("Quel est le délai de livraison estimé pour l'Italie ?"),
      true,
    );
    assert.equal(detectDestination("pour l'Italie")?.key, "it");
  });

  it("answers Italy with transit days, not same-day alone", () => {
    const listing: ListingDetails = {
      itemId: "1",
      title: "Écran MacBook",
      dispatchTimeMax: "0",
      itemSpecifics: [],
      variations: [],
      shippingOptions: [],
      rawAvailable: true,
    };
    const text = formatShippingDelayReply({
      message: "Quel est le délai de livraison estimé pour l'Italie ?",
      listing,
    });
    assert.ok(text);
    assert.match(text!, /italie/i);
    assert.match(text!, /4|5/);
    assert.match(text!, /jours?\s+ouvr/i);
    assert.match(text!, /jour m[êe]me|15h/i);
  });

  it("keeps dispatch-only for délai d'expédition", () => {
    const text = formatShippingDelayReply({
      message: "Délai d'expédition ?",
      listing: {
        itemId: "1",
        dispatchTimeMax: "0",
        itemSpecifics: [],
        variations: [],
        shippingOptions: [],
        rawAvailable: true,
      },
    });
    assert.match(text ?? "", /jour m[êe]me|15h/i);
    assert.doesNotMatch(text ?? "", /italie|4–5/i);
  });

  it("prefers listing international ShippingTime when present", () => {
    const text = formatShippingDelayReply({
      message: "délai de livraison Italie ?",
      listing: {
        itemId: "1",
        dispatchTimeMax: "0",
        itemSpecifics: [],
        variations: [],
        shippingOptions: [
          {
            service: "EU_Standard",
            cost: "8.50",
            international: true,
            timeMin: "3",
            timeMax: "7",
          },
        ],
        rawAvailable: true,
      },
    });
    assert.match(text ?? "", /3–7|3-7/);
  });
});
