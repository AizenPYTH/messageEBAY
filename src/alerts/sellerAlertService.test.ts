import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeMessage } from "../analysis/analyzeMessage.js";
import { isOwnListing } from "../conversations/messageSides.js";

describe("seller alert ownership", () => {
  it("must not treat purchase threads as seller cases", () => {
    assert.equal(
      isOwnListing({
        authUsername: "aize-5",
        listingSeller: "vendeur-ecran",
      }),
      false,
    );
  });

  it("photo request from us is still detected in text, but ownership blocks alert", () => {
    const plan = analyzeMessage(
      "bonjour est il possible d'avoir davantage de photo ?",
    );
    assert.equal(plan.needsSellerIntervention, true);
    assert.equal(plan.escalationReason, "photo_request");
    // Ownership check is what prevents the false alert in ensureSellerAlerts.
    assert.equal(
      isOwnListing({
        authUsername: "aize-5",
        listingSeller: "vendeur-ecran",
      }),
      false,
    );
  });
});
