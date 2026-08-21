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

  it("ignores unrelated questions", () => {
    assert.equal(isTrackingRequest("Fonctionnel ?"), false);
    assert.equal(isTrackingRequest("Merci"), false);
  });
});
