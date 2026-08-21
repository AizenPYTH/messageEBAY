import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListingDetails } from "../ebay/tradingApi.js";
import { analyzeMessage } from "./analyzeMessage.js";
import {
  buildListingFactualReply,
  enrichResponsePlanWithListing,
} from "./listingEvidence.js";

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

describe("enrichResponsePlanWithListing", () => {
  it("answers functional questions directly when listing implies working item", () => {
    const plan = analyzeMessage("Fonctionnel ?");
    const enriched = enrichResponsePlanWithListing(
      plan,
      "Fonctionnel ?",
      listing({
        condition: "Neuf",
        listingStatus: "Active",
        descriptionText: "Produit testé, 100% fonctionnel",
      }),
    );

    assert.equal(enriched.closedQuestionTopic, "functional");
    assert.equal(enriched.listingAnswerability, "direct_yes");
    assert.match(enriched.suggestedDirectReply ?? "", /fonctionnelle/i);
  });

  it("answers availability from Active stock", () => {
    const plan = analyzeMessage("Disponible ?");
    const enriched = enrichResponsePlanWithListing(
      plan,
      "Disponible ?",
      listing({ listingStatus: "Active", quantity: "3", quantityAvailable: 3 }),
    );

    assert.equal(enriched.closedQuestionTopic, "available");
    assert.equal(enriched.listingAnswerability, "direct_yes");
    assert.match(enriched.suggestedDirectReply ?? "", /disponible|tjr dispo/i);
  });

  it("says no when a specific variation is out of stock", () => {
    const plan = analyzeMessage("Vous avez le Surface Pro 8 ?");
    const enriched = enrichResponsePlanWithListing(
      plan,
      "Vous avez le Surface Pro 8 ?",
      listing({
        listingStatus: "Active",
        quantityAvailable: 2,
        variations: [
          {
            quantity: 5,
            quantitySold: 5,
            quantityAvailable: 0,
            specifics: [{ name: "Modèle", value: "Surface Pro 8" }],
          },
          {
            quantity: 2,
            quantitySold: 0,
            quantityAvailable: 2,
            specifics: [{ name: "Modèle", value: "Surface Pro 7" }],
          },
        ],
      }),
    );
    assert.equal(enriched.listingAnswerability, "direct_no");
    assert.match(enriched.suggestedDirectReply ?? "", /plus disponible|n'est plus/i);
    // Do not pitch other in-stock models the buyer did not ask for.
    assert.doesNotMatch(enriched.suggestedDirectReply ?? "", /Pro 7/i);
  });

  it("answers stock AND shipping together (not shipping only)", () => {
    const result = buildListingFactualReply({
      message:
        "bonjour écran surface pro 8 est dispo ? et pouvez vous me dire le temps de livraison , merci",
      listing: listing({
        title:
          "ecran microsoft surface pro 4 / 5 / 6 / 7 / 8 / 9 Lapotop 1 2 3 4 book 1 / 2",
        listingStatus: "Active",
        quantityAvailable: 5,
        dispatchTimeMax: "0",
        variations: [
          {
            quantity: 1,
            quantitySold: 1,
            quantityAvailable: 0,
            specifics: [{ name: "Modèle", value: "Surface Pro 8" }],
          },
          {
            quantity: 3,
            quantitySold: 0,
            quantityAvailable: 3,
            specifics: [{ name: "Modèle", value: "Surface Pro 7" }],
          },
        ],
      }),
    });
    assert.ok(result.reply);
    assert.match(result.reply!, /Surface Pro 8/i);
    assert.match(result.reply!, /plus disponible|n'est plus/i);
    assert.match(result.reply!, /jour même|expédition|envoi|15h/i);
  });

  it("does not answer stock when buyer asks compatibility; nuance goes to LLM", () => {
    const result = buildListingFactualReply({
      message: "Juste elle et compatible partout ?",
      listing: listing({
        title: "Carte Sim Lyca Mobile PréPayée 5€ 5G",
        listingStatus: "Active",
        quantityAvailable: 40,
        descriptionText: "Carte SIM prépayée Lycamobile.",
      }),
    });
    // No canned stock / no rigid "garantir partout" template — LLM drafts the reply.
    assert.ok(!result.reply);
    assert.doesNotMatch(result.reply ?? "", /disponible|tjr dispo|en stock|Hello|Unfortunately|garantir/i);
    assert.ok(
      result.signals.some((s) => s.includes("compatible_nuance") || s.includes("compatible_to_llm")),
    );
    assert.equal(result.answerability, "unknown");
  });

  it("says no when asked color not on the listing", () => {
    const plan = analyzeMessage("Vous avez en rouge ?");
    const enriched = enrichResponsePlanWithListing(
      plan,
      "Vous avez en rouge ?",
      listing({
        listingStatus: "Active",
        quantityAvailable: 1,
        title: "Écran MacBook Pro Argenté",
        itemSpecifics: [{ name: "Couleur", value: "Argent" }],
      }),
    );
    assert.equal(enriched.listingAnswerability, "direct_no");
    assert.match(enriched.suggestedDirectReply ?? "", /rouge/i);
  });

  it("answers shipping delay from DispatchTimeMax", () => {
    const plan = analyzeMessage("Délai d'expédition ?");
    const enriched = enrichResponsePlanWithListing(
      plan,
      "Délai d'expédition ?",
      listing({ listingStatus: "Active", dispatchTimeMax: "2" }),
    );
    assert.equal(enriched.closedQuestionTopic, "fast_shipping");
    assert.equal(enriched.listingAnswerability, "direct_yes");
    assert.match(enriched.suggestedDirectReply ?? "", /2 jours|jour/i);
  });

  it("answers Italy delivery ETA with transit, not same-day alone", () => {
    const ask = "Quel est le délai de livraison estimé pour l'Italie ?";
    const plan = analyzeMessage(ask);
    const enriched = enrichResponsePlanWithListing(
      plan,
      ask,
      listing({ listingStatus: "Active", dispatchTimeMax: "0" }),
    );
    assert.equal(enriched.closedQuestionTopic, "fast_shipping");
    assert.match(enriched.suggestedDirectReply ?? "", /italie/i);
    assert.match(enriched.suggestedDirectReply ?? "", /4|5/);
    assert.doesNotMatch(
      `^${(enriched.suggestedDirectReply ?? "").trim()}$`,
      /^envoi le jour même avant 15h/i,
    );
  });

  it("answers condition questions from listing condition", () => {
    const plan = analyzeMessage("En bon état ?");
    const enriched = enrichResponsePlanWithListing(
      plan,
      "En bon état ?",
      listing({ condition: "Reconditionné par le vendeur" }),
    );

    assert.equal(enriched.closedQuestionTopic, "condition");
    assert.equal(enriched.listingAnswerability, "direct_yes");
    assert.match(enriched.suggestedDirectReply ?? "", /bon état/i);
  });

  it("stays cautious when battery originality is not in listing", () => {
    const plan = analyzeMessage("Batterie d'origine ?");
    const enriched = enrichResponsePlanWithListing(
      plan,
      "Batterie d'origine ?",
      listing({
        title: "iPhone 12 64Go",
        condition: "Occasion",
        descriptionText: "Téléphone en bon état cosmétique",
      }),
    );

    assert.equal(enriched.closedQuestionTopic, "battery_original");
    assert.equal(enriched.listingAnswerability, "unknown");
  });

  it("explains Générique as aftermarket, not as used-device grade", () => {
    const ask =
      "Pouvez-vous me préciser ce que vous entendez par : gris Grade A « Générique » ?";
    const plan = analyzeMessage(ask);
    const enriched = enrichResponsePlanWithListing(
      plan,
      ask,
      listing({
        title:
          "Écran LCD Retina 13,3 pour MacBook Pro A1989 2018-2019 Gris Grade A Générique",
      }),
    );
    assert.equal(enriched.closedQuestionTopic, "oem_generic");
    assert.equal(enriched.listingAnswerability, "direct_yes");
    assert.match(enriched.suggestedDirectReply ?? "", /pas une pièce originale Apple/i);
    assert.match(enriched.suggestedDirectReply ?? "", /marche|fonctionnel/i);
    assert.doesNotMatch(enriched.suggestedDirectReply ?? "", /usure|on ne teste pas/i);
  });
});
