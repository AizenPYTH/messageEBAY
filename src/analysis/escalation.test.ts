import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { detectEscalation } from "./escalation.js";

describe("detectEscalation", () => {
  it("escalates photo requests", () => {
    const d = detectEscalation("Pouvez-vous m'envoyer une photo de l'écran ?");
    assert.equal(d.needsSellerIntervention, true);
    assert.equal(d.reason, "photo_request");
  });

  it("does not escalate simple functional questions", () => {
    const d = detectEscalation("Fonctionnel ?");
    assert.equal(d.needsSellerIntervention, false);
  });

  it("escalates phone / WhatsApp requests", () => {
    const d = detectEscalation("Donne-moi ton numéro WhatsApp");
    assert.equal(d.needsSellerIntervention, true);
    assert.equal(d.reason, "call_request");
  });

  it("does not escalate mere PayPal / eBay contact mentions", () => {
    const d = detectEscalation(
      "j'ai contacté ebay et paypal pour signaler le problème",
    );
    assert.equal(d.needsSellerIntervention, false);
  });

  it("escalates real off-platform payment asks", () => {
    const d = detectEscalation(
      "Pouvez-vous me faire un paiement via PayPal amis et famille ?",
    );
    assert.equal(d.needsSellerIntervention, true);
    assert.equal(d.reason, "off_platform_payment");
  });
});

