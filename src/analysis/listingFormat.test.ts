import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListingDetails } from "../ebay/tradingApi.js";
import {
  formatPurchaseHowReply,
  isAuctionListing,
  isBuyItNowAsk,
  listingHasBuyItNow,
  wantsPurchaseHowReply,
} from "./listingFormat.js";

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

const auction = listing({
  title: "Apple iPhone SE 2020 64Go Rouge – Batterie 74% – Fonctionnel",
  listingType: "Chinese",
  price: "35.0",
  startPrice: "35.0",
  currency: "EUR",
  listingStatus: "Active",
  bidCount: "2",
  shippingOptions: [
    { service: "FR_Colissimo", cost: "0.0", international: false },
    {
      service: "LaPosteColissimoInternational",
      cost: "15.0",
      international: true,
    },
  ],
});

describe("listing format / auction vs Buy It Now", () => {
  it("treats Chinese listings as auctions without BIN", () => {
    assert.equal(isAuctionListing(auction), true);
    assert.equal(listingHasBuyItNow(auction), false);
    assert.equal(isBuyItNowAsk("Achat immédiat possible ?"), true);
    assert.equal(wantsPurchaseHowReply("Quel prix merci"), true);
  });

  it("says no BIN and gives the current bid (mob205)", () => {
    const bin = formatPurchaseHowReply({
      message: "Achat immédiat possible ?",
      listing: auction,
    });
    assert.match(bin ?? "", /enchère/i);
    assert.doesNotMatch(bin ?? "", /Oui, l'achat immédiat est possible/i);
    assert.match(bin ?? "", /35/);

    const price = formatPurchaseHowReply({
      message: "Quel prix merci",
      listing: auction,
    });
    assert.match(price ?? "", /35/);
    assert.match(price ?? "", /enchère/i);
    assert.doesNotMatch(price ?? "", /frais d'envoi/i);

    const pay = formatPurchaseHowReply({
      message:
        "Oui moi c’est pour la France mais combien le prix du téléphone est où je peux payer car sur l’annonce je peux pas payer en achat immédiat ou donner votre Paypal",
      listing: auction,
    });
    assert.match(pay ?? "", /enchère/i);
    assert.match(pay ?? "", /35/);
    assert.match(pay ?? "", /PayPal/i);
    assert.match(pay ?? "", /eBay/i);
    assert.match(pay ?? "", /0\s*€/i);
    assert.doesNotMatch(pay ?? "", /Oui, l'achat immédiat est possible/i);
  });

  it("says yes BIN on a fixed-price listing", () => {
    const reply = formatPurchaseHowReply({
      message: "Achat immédiat possible ?",
      listing: listing({
        listingType: "FixedPriceItem",
        price: "50",
        currency: "EUR",
      }),
    });
    assert.match(reply ?? "", /Oui, l'achat immédiat est possible/i);
    assert.match(reply ?? "", /50/);
  });
});
