import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListingDetails } from "../ebay/tradingApi.js";
import {
  formatFirmPriceReply,
  isCounterOffer,
  isPriceNegotiationAsk,
} from "./firmPrice.js";

function listing(partial: Partial<ListingDetails>): ListingDetails {
  return {
    itemId: "1",
    itemSpecifics: [],
    variations: [],
    shippingOptions: [],
    rawAvailable: true,
    ...partial,
  };
}

const screen = listing({
  title: 'ÉCRAN LCD COMPLET POUR MACBOOK PRO 16" A2485 A2780 GRIS GRADE B',
  price: "459.00",
  currency: "EUR",
  listingType: "FixedPriceItem",
  listingStatus: "Active",
  quantityAvailable: 1,
});

describe("firmPrice", () => {
  it("detects last-price and number offers", () => {
    assert.equal(
      isPriceNegotiationAsk(
        "bonjour disponible? quels serait votre dernier prix pour un achat immédiat",
      ),
      true,
    );
    assert.equal(isCounterOffer("340"), true);
    assert.equal(isCounterOffer("meme a 420"), true);
    assert.equal(
      isPriceNegotiationAsk("quels serait votre marge de négociation ?"),
      true,
    );
    assert.equal(isPriceNegotiationAsk("Achat immédiat possible ?"), false);
  });

  it("answers stock + firm price without legal jargon (amhelat_0)", () => {
    const first = formatFirmPriceReply({
      message:
        "bonjour disponible? quels serait votre dernier prix pour un achat immédiat",
      listing: screen,
    });
    assert.match(first ?? "", /tjr dispo/i);
    assert.match(first ?? "", /459/);
    assert.match(first ?? "", /on peut pas vraiment descendre/i);
    assert.doesNotMatch(first ?? "", /autoris/i);
    assert.doesNotMatch(first ?? "", /proposition/i);
    assert.doesNotMatch(first ?? "", /Grade A/i);
    assert.doesNotMatch(first ?? "", /discuter du prix/i);

    const offer = formatFirmPriceReply({
      message: "meme a 420",
      listing: screen,
    });
    assert.match(offer ?? "", /459/);
    assert.doesNotMatch(offer ?? "", /autoris/i);
    assert.doesNotMatch(offer ?? "", /tjr dispo/i);
  });
});
