import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isBuyerUpset } from "../prompt/policyRules.js";
import { filterSimilarForStyle } from "./filterSimilar.js";

describe("filterSimilarForStyle", () => {
  it("drops paypal/litige examples unless buyer mentioned them", () => {
    const examples = [
      {
        ebayConversationId: "1",
        score: 0.9,
        clientQuestion: "Où est mon colis ?",
        sellerReply: "Envoyé hier, voici le suivi.",
        matchedMessageId: "a",
        matchedSender: "buyer",
      },
      {
        ebayConversationId: "2",
        score: 0.88,
        clientQuestion: "Je contacte PayPal",
        sellerReply: "Ouvrez un litige objet non reçu",
        matchedMessageId: "b",
        matchedSender: "buyer",
      },
    ];
    const filtered = filterSimilarForStyle({
      examples,
      buyerText: "Toujours pas reçu mon colis",
      max: 3,
    });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0]?.ebayConversationId, "1");
  });
});

describe("isBuyerUpset", () => {
  it("detects exclamation and strong words", () => {
    assert.equal(isBuyerUpset("Toujours rien !!!"), true);
    assert.equal(isBuyerUpset("C'est inadmissible"), true);
    assert.equal(isBuyerUpset("Bonjour, c'est expédié ?"), false);
  });
});
