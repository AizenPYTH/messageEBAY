import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asksFreeShipping,
  buyerLikelyAbroad,
  formatShippingCostReply,
  isShippingCostAsk,
  listingHasDomesticFreeShipping,
  listingHasFreeShipping,
  replyInventsFreeShipping,
} from "./shippingCost.js";
import type { ListingDetails } from "../ebay/tradingApi.js";

const paidListing: ListingDetails = {
  itemId: "1",
  currency: "EUR",
  itemSpecifics: [],
  variations: [],
  shippingOptions: [{ service: "FR_Colissimo", cost: "7.50", international: false }],
  rawAvailable: true,
};

const franceFreeAbroadPaid: ListingDetails = {
  itemId: "1",
  currency: "EUR",
  itemSpecifics: [],
  variations: [],
  shippingOptions: [
    { service: "FR_Tracked", cost: "0.0", international: false },
    { service: "EU_Standard", cost: "8.50", international: true },
  ],
  rawAvailable: true,
};

describe("isShippingCostAsk", () => {
  it("detects 0€ shipping ask and high cost complaint", () => {
    assert.equal(
      isShippingCostAsk("Existe-t-il également une possibilité de livraison à 0,0 € ?"),
      true,
    );
    assert.equal(
      isShippingCostAsk(
        "Le problème est que le coût de livraison est trop élevé, presque égal à celui de la carte...",
      ),
      true,
    );
    assert.equal(isShippingCostAsk("C'est dispo ?"), false);
    assert.equal(asksFreeShipping("livraison à 0,0 € ?"), true);
  });
});

describe("buyerLikelyAbroad", () => {
  it("detects Italian / translated buyers", () => {
    assert.equal(buyerLikelyAbroad("Esiste anche una spedizione a 0? Grazie Luca"), true);
    assert.equal(buyerLikelyAbroad("Traduit\nExiste-t-il une livraison à 0 ?"), true);
    assert.equal(buyerLikelyAbroad("C'est dispo en France ?"), false);
  });
});

describe("formatShippingCostReply", () => {
  it("refuses invented free shipping when listing has paid rates", () => {
    const text = formatShippingCostReply({
      listing: paidListing,
      askedFree: true,
    });
    assert.match(text, /pas de livraison à 0/i);
    assert.match(text, /7[,.]50/);
    assert.doesNotMatch(text, /nous proposons également.*0/i);
  });

  it("does not offer France 0€ to a foreign buyer", () => {
    assert.equal(listingHasDomesticFreeShipping(franceFreeAbroadPaid), true);
    const text = formatShippingCostReply({
      listing: franceFreeAbroadPaid,
      askedFree: true,
      buyerAbroad: true,
    });
    assert.match(text, /uniquement pour la France/i);
    assert.match(text, /8[,.]50/);
    assert.doesNotMatch(text, /nous proposons également/i);
    assert.doesNotMatch(text, /pourrait vous convenir/i);
  });

  it("says France-only without pitching 0€ as a yes", () => {
    const text = formatShippingCostReply({
      listing: franceFreeAbroadPaid,
      askedFree: true,
      buyerAbroad: false,
    });
    assert.match(text, /uniquement pour la France/i);
    assert.doesNotMatch(text, /pourrait vous convenir/i);
    assert.doesNotMatch(text, /nous proposons également/i);
  });

  it("ignores pickup 0 as free mail", () => {
    const listing: ListingDetails = {
      ...paidListing,
      shippingOptions: [{ service: "Pickup", cost: "0.0", international: false }],
    };
    assert.equal(listingHasFreeShipping(listing), false);
  });
});

describe("replyInventsFreeShipping", () => {
  it("flags the Luca-style invented 0 EUR offer", () => {
    assert.equal(
      replyInventsFreeShipping(
        "nous proposons également une option de livraison en suivi à 0,0 EUR",
        paidListing,
      ),
      true,
    );
    assert.equal(
      replyInventsFreeShipping(
        "nous proposons également une option de livraison en suivi à 0,0 EUR",
        franceFreeAbroadPaid,
        true,
      ),
      true,
    );
    assert.equal(
      replyInventsFreeShipping(
        "nous proposons également une option de livraison en suivi à 0,0 EUR",
        franceFreeAbroadPaid,
      ),
      true,
    );
    assert.equal(
      replyInventsFreeShipping(
        "Le 0 € c'est uniquement pour la France. À l'étranger ce sont les frais internationaux.",
        franceFreeAbroadPaid,
      ),
      false,
    );
    assert.equal(
      replyInventsFreeShipping("Les frais sont 7,50 EUR.", paidListing),
      false,
    );
  });
});
