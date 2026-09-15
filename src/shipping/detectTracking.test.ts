import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTrackingRequest } from "./detectTracking.js";

describe("isTrackingRequest", () => {
  it("detects French tracking questions", () => {
    assert.equal(isTrackingRequest("Où est mon colis ?"), true);
    assert.equal(isTrackingRequest("Vous avez un numéro de suivi ?"), true);
    assert.equal(isTrackingRequest("C'est expédié ?"), true);
  });

  it("detects English tracking questions", () => {
    assert.equal(isTrackingRequest("Where is my package?"), true);
    assert.equal(isTrackingRequest("Do you have a tracking number?"), true);
  });

  it("detects not-received as tracking (not dispute)", () => {
    assert.equal(isTrackingRequest("Je n'ai pas reçu mon colis"), true);
    assert.equal(isTrackingRequest("Toujours pas reçu"), true);
    assert.equal(isTrackingRequest("I never received the package"), true);
  });

  it("treats existing-order follow-ups as tracking, not stock", () => {
    assert.equal(
      isTrackingRequest(
        "Bonjour avez vous des informations de suivi sur la commande svp ? Merci",
      ),
      true,
    );
    assert.equal(
      isTrackingRequest(
        "Le lien correspond pas à mon annonce et le suivi sur ma commande n'est pas à jour",
      ),
      true,
    );
    assert.equal(
      isTrackingRequest(
        "Bonjour avez vous des retours par rapport à ma commande ? Merci",
      ),
      true,
    );
    assert.equal(
      isTrackingRequest(
        "Bonjour pouvez vous expédier ce que je vous ai commandé ? Merci",
      ),
      true,
    );
  });

  it("ignores unrelated questions", () => {
    assert.equal(isTrackingRequest("Fonctionnel ?"), false);
    assert.equal(isTrackingRequest("Merci"), false);
  });
});
