import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeMessage } from "./analyzeMessage.js";

describe("analyzeMessage", () => {
  it("detects simple closed questions as very_short", () => {
    const cases = [
      "Fonctionnel ?",
      "Disponible ?",
      "Toujours en vente ?",
      "Batterie d'origine ?",
      "Chargeur fourni ?",
      "AZERTY ?",
      "Compatible ?",
      "État ?",
      "Prix ferme ?",
    ];

    for (const text of cases) {
      const plan = analyzeMessage(text);
      assert.equal(plan.intent, "closed_question", text);
      assert.equal(plan.isSimpleQuestion, true, text);
      assert.equal(plan.recommendedLength, "very_short", text);
      assert.equal(plan.avoidListingRecap, true, text);
      assert.equal(plan.compactListingContext, true, text);
      assert.ok(plan.maxWords <= 40, text);
    }
  });

  it("detects multi-question and asks for point-by-point style", () => {
    const plan = analyzeMessage(
      [
        "Bonjour,",
        "Le clavier est-il AZERTY ?",
        "La batterie est-elle d'origine ?",
        "Le chargeur est-il fourni ?",
      ].join("\n"),
    );

    assert.equal(plan.intent, "multi_question");
    assert.equal(plan.isMultiQuestion, true);
    assert.ok(plan.questionCount >= 2);
    assert.equal(plan.recommendedLength, "medium");
    assert.equal(plan.avoidListingRecap, true);
  });

  it("detects negotiation intent", () => {
    const plan = analyzeMessage("Bonjour, quel est votre meilleur prix ?");
    assert.equal(plan.intent, "negotiation");
    assert.equal(plan.avoidListingRecap, true);
  });

  it("detects return / refund intent", () => {
    const plan = analyzeMessage("Puis-je faire un retour et être remboursé ?");
    assert.equal(plan.intent, "return_request");
  });

  it("detects technical/detailed questions", () => {
    const plan = analyzeMessage(
      "Pouvez-vous me donner les caractéristiques techniques précises et comparer avec le modèle A2338 ?",
    );
    assert.equal(plan.intent, "technical");
    assert.equal(plan.recommendedLength, "long");
    assert.equal(plan.detailLevel, "detailed");
  });

  it("detects greeting and thanks as very short", () => {
    assert.equal(analyzeMessage("Bonjour").intent, "greeting");
    assert.equal(analyzeMessage("Merci").intent, "thanks");
    assert.equal(analyzeMessage("Bonjour").recommendedLength, "very_short");
  });

  it("detects French language for French questions", () => {
    const plan = analyzeMessage("Bonjour, est-ce toujours disponible ?");
    assert.equal(plan.languageCode, "fr");
  });

  it("detects shipping tracking intent", () => {
    const plan = analyzeMessage("Où est mon colis ?");
    assert.equal(plan.intent, "shipping_tracking");
  });

  it("treats not-received as shipping tracking", () => {
    const plan = analyzeMessage("Bonjour, je n'ai pas reçu mon colis");
    assert.equal(plan.intent, "shipping_tracking");
  });

  it("treats order news / ship-my-order as tracking not stock", () => {
    assert.equal(
      analyzeMessage(
        "Bonjour avez vous des retours par rapport à ma commande ? Merci",
      ).intent,
      "shipping_tracking",
    );
    assert.equal(
      analyzeMessage(
        "Bonjour pouvez vous expédier ce que je vous ai commandé ? Merci",
      ).intent,
      "shipping_tracking",
    );
    assert.equal(
      analyzeMessage(
        "Bonjour avez vous des informations de suivi sur la commande svp ? Merci",
      ).intent,
      "shipping_tracking",
    );
  });
});
