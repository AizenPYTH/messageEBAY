import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTrackingFollowUp } from "./trackingFollowUp.js";

describe("isTrackingFollowUp", () => {
  it("is false on first tracking ask", () => {
    assert.equal(
      isTrackingFollowUp({
        sellerUsername: "seller1",
        messages: [
          {
            messageId: "1",
            senderUsername: "buyer1",
            messageBody: "Où est mon colis ?",
          },
        ],
      }),
      false,
    );
  });

  it("is true when buyer asked tracking before", () => {
    assert.equal(
      isTrackingFollowUp({
        sellerUsername: "seller1",
        messages: [
          {
            messageId: "1",
            senderUsername: "buyer1",
            messageBody: "C'est expédié ?",
          },
          {
            messageId: "2",
            senderUsername: "seller1",
            messageBody: "Oui, envoyé hier.",
          },
          {
            messageId: "3",
            senderUsername: "buyer1",
            messageBody: "Toujours pas de mouvement ?",
          },
        ],
      }),
      true,
    );
  });
});
