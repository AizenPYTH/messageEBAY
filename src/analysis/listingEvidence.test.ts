import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListingDetails } from "../ebay/tradingApi.js";
import { analyzeMessage } from "./analyzeMessage.js";
import { enrichResponsePlanWithListing } from "./listingEvidence.js";

function listing(partial: Partial<ListingDetails>): ListingDetails {
  return {
    itemId: "1",
    itemSpecifics: [],
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
      listing({ listingStatus: "Active", quantity: "3" }),
    );

    assert.equal(enriched.closedQuestionTopic, "available");
    assert.equal(enriched.listingAnswerability, "direct_yes");
    assert.match(enriched.suggestedDirectReply ?? "", /disponible/i);
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
});
