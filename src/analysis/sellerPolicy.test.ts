/**
 * Shop policy: price, auctions, orders already placed, and what is in the box.
 * Each case comes from a thread where the wrong answer went out to a buyer.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListingDetails } from "../ebay/tradingApi.js";
import {
  auctionHasBuyItNow,
  formatAuctionReply,
  isAuctionListing,
  isBuyItNowAsk,
  isOffPlatformPaymentAsk,
} from "./auction.js";
import { unprovableContentsAsk, replyDeniesUnprovenComponent } from "./contentsAsk.js";
import { isAboutExistingOrder, replyPushesOtherListing } from "./orderContext.js";
import {
  extractOfferedAmount,
  formatFirmPriceReply,
  isPriceNegotiation,
  replyInvitesNegotiation,
} from "./priceOffer.js";
import { isClosingAck } from "./needsReply.js";
import { blocksFactualShortcut } from "./factualShortcut.js";
import { detectAllListingTopics } from "./listingEvidence.js";
import { analyzeMessage } from "./analyzeMessage.js";
import { isTrackingRequest } from "../shipping/detectTracking.js";

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

describe("prix — amhelat_0", () => {
  it("reads an offer whether it names a number or just asks for a discount", () => {
    assert.equal(isPriceNegotiation("je vous en propose 340 €"), true);
    assert.equal(isPriceNegotiation("C'est quoi votre dernier prix ?"), true);
    assert.equal(isPriceNegotiation("vous faites une remise ?"), true);
    assert.equal(isPriceNegotiation("Bonjour, c'est toujours dispo ?"), false);
  });

  it("does not mistake a model number for an offer", () => {
    assert.equal(extractOfferedAmount("vous avez le A1989 ?"), undefined);
    assert.equal(extractOfferedAmount("je vous en propose 340 €"), 340);
    assert.equal(extractOfferedAmount("340 ou 420 euros ?"), 420);
  });

  it("refuses without jargon and without inviting another offer", () => {
    const reply = formatFirmPriceReply({ listingPrice: "459.00" });
    assert.match(reply ?? "", /459 €/);
    assert.equal(replyInvitesNegotiation(reply ?? ""), false);
  });

  it("catches the two phrasings that were actually sent", () => {
    assert.equal(
      replyInvitesNegotiation("La négociation n'est pas autorisée sur cette annonce."),
      true,
    );
    assert.equal(
      replyInvitesNegotiation("Faites une proposition, nous pourrons discuter du prix."),
      true,
    );
  });
});

describe("enchère — mob205", () => {
  const auction = listing({
    title: "iPhone SE 64Go",
    listingType: "Chinese",
    bidCount: 3,
    price: "51.00",
  });

  it("knows an auction from a fixed price listing", () => {
    assert.equal(isAuctionListing(auction), true);
    assert.equal(isAuctionListing(listing({ listingType: "FixedPriceItem" })), false);
    assert.equal(auctionHasBuyItNow(auction), false);
  });

  it("says no to Buy It Now and keeps payment on eBay", () => {
    const reply = formatAuctionReply({
      listing: auction,
      askedBuyItNow: isBuyItNowAsk("achat immédiat possible ? vous prenez PayPal ?"),
      askedOffPlatformPayment: isOffPlatformPaymentAsk(
        "achat immédiat possible ? vous prenez PayPal ?",
      ),
    });
    assert.match(reply ?? "", /Non, c'est une enchère/i);
    assert.match(reply ?? "", /51 €/);
    assert.match(reply ?? "", /uniquement sur eBay/i);
  });

  it("confirms Buy It Now when the auction really has one and no bid yet", () => {
    const reply = formatAuctionReply({
      listing: listing({
        listingType: "Chinese",
        bidCount: 0,
        buyItNowPrice: "80.00",
        price: "51.00",
      }),
      askedBuyItNow: true,
      askedOffPlatformPayment: false,
    });
    assert.match(reply ?? "", /achat immédiat est possible à 80 €/i);
  });
});

describe("commande déjà passée — arapu17", () => {
  it("recognises a question about an existing order", () => {
    assert.equal(
      isAboutExistingOrder("avez-vous des retours par rapport à ma commande ?"),
      true,
    );
    assert.equal(
      isAboutExistingOrder("Pouvez-vous expédier ce que j'ai commandé"),
      true,
    );
    assert.equal(isAboutExistingOrder("Vous avez un écran iPhone 13 ?"), false);
  });

  it("keeps the stock templates away from it", () => {
    assert.equal(
      blocksFactualShortcut("avez-vous des retours par rapport à ma commande ?"),
      true,
    );
  });

  it("spots a reply that answers with another listing", () => {
    assert.equal(
      replyPushesOtherListing({
        reply: "Oui on a le clavier en stock, voici le lien : https://www.ebay.fr/itm/999",
        currentItemId: "3",
      }),
      true,
    );
    assert.equal(
      replyPushesOtherListing({
        reply: "Votre colis part aujourd'hui, le suivi arrive ce soir.",
        currentItemId: "3",
      }),
      false,
    );
  });
});

describe("contenu du lot — mamulti0", () => {
  const topcase = listing({
    title: "Topcase MacBook Pro 13 A2338 Gris",
    descriptionText: "Topcase complet pour A2338.",
  });

  it("stays silent when only the photos could answer", () => {
    const result = unprovableContentsAsk({
      message: "est-ce que la Touch Bar et le trackpad sont inclus ?",
      listing: topcase,
    });
    assert.equal(result.unprovable, true);
    assert.deepEqual(result.components, ["Touch Bar", "trackpad"]);
  });

  it("answers normally when the listing does describe it", () => {
    const result = unprovableContentsAsk({
      message: "le clavier est inclus ?",
      listing: listing({
        title: "Topcase MacBook Pro 13 A2338",
        descriptionText: "Topcase avec clavier AZERTY monté.",
      }),
    });
    assert.equal(result.unprovable, false);
  });

  it("flags the invented refusal that lost the sale", () => {
    assert.equal(
      replyDeniesUnprovenComponent({
        reply: "No, just the top case.",
        message: "Is the Touch Bar included ?",
        listing: topcase,
      }),
      true,
    );
  });
});

describe("fil clos — hl5198", () => {
  it("treats a closing ack as the end of the thread", () => {
    for (const text of ["Ok merci", "Merci beaucoup", "Parfait, merci", "Très bien"]) {
      assert.equal(isClosingAck(text), true, text);
    }
  });

  it("does not treat a greeting or a question as the end", () => {
    assert.equal(isClosingAck("Bonjour"), false);
    assert.equal(isClosingAck("Ok et vous avez la couleur noire ?"), false);
  });
});

describe("sujets d'annonce", () => {
  it("does not read a keyboard sale as a layout question", () => {
    // The shop sells keyboards; the bare noun is the product, not the ask.
    assert.deepEqual(detectAllListingTopics("avez-vous encore un clavier A1989 ?"), [
      "available",
    ]);
    assert.ok(
      detectAllListingTopics("le clavier est en AZERTY ?").includes("keyboard_layout"),
    );
  });

  it("does not read a battery sale as an origin question", () => {
    assert.deepEqual(detectAllListingTopics("vous avez une batterie A1989 ?"), [
      "available",
    ]);
    assert.ok(
      detectAllListingTopics("la batterie est d'origine ?").includes(
        "battery_original",
      ),
    );
  });

  it("sees a discount ask as a price question", () => {
    assert.ok(detectAllListingTopics("vous faites une remise ?").includes("firm_price"));
  });
});

describe("accents et \\b", () => {
  it("détecte les formes accentuées, que \\b (ASCII) laissait passer", () => {
    // `\b` ne ferme pas un mot après "é" : ces motifs ne matchaient que les
    // orthographes sans accent, soit quasiment jamais.
    const plan = analyzeMessage("Le téléphone est débloqué ?");
    assert.ok(
      detectAllListingTopics("Le téléphone est débloqué ?").includes("unlocked"),
      "débloqué doit être vu comme une question de déblocage",
    );
    assert.ok(plan.intentLabel.length > 0);
    assert.equal(isTrackingRequest("Le colis n'est pas arrivé"), true);
    assert.equal(isTrackingRequest("Toujours pas arrivée !"), true);
  });
});
