import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { clientNeedsReply, isNoReplyNeeded } from "./needsReply.js";

describe("isNoReplyNeeded", () => {
  it("ignores thanks and goodbye", () => {
    assert.equal(isNoReplyNeeded("Merci beaucoup !"), true);
    assert.equal(isNoReplyNeeded("Bonne journée"), true);
    assert.equal(isNoReplyNeeded("Ok parfait"), true);
  });

  it("ignores lone greetings", () => {
    assert.equal(isNoReplyNeeded("Bonjour"), true);
    assert.equal(isNoReplyNeeded("Bonsoir !"), true);
    assert.equal(isNoReplyNeeded("Hello"), true);
  });

  it("still requires reply for real questions", () => {
    assert.equal(isNoReplyNeeded("Ok et le prix ?"), false);
    assert.equal(isNoReplyNeeded("Fonctionnel ?"), false);
    assert.equal(isNoReplyNeeded("Bonjour, c'est dispo ?"), false);
  });

  it("ignores waiting / très bien / evaluation (ducat80-style)", () => {
    assert.equal(
      isNoReplyNeeded(
        "Bonjour, merci j'attends de le recevoir avec impatience. Cordialement Cyril (ducat80)",
      ),
      true,
    );
    assert.equal(
      isNoReplyNeeded("Très bien, je n'en doute pas. Cordialement Cyril"),
      true,
    );
    assert.equal(
      isNoReplyNeeded(
        "Merci bien, je ne manquerai pas de vous faire une évaluation en mesure de la qualité du service et du produit. Cordialement Cyril",
      ),
      true,
    );
    assert.equal(isNoReplyNeeded("parfait .merci a vous"), true);
    assert.equal(isNoReplyNeeded("Ok, merci de votre aide"), true);
    assert.equal(isNoReplyNeeded("Merci ! No problem."), true);
    assert.equal(
      isNoReplyNeeded(
        "Je m'excuse beaucoup pour la confusion que j'ai créée. Je vous en suis vraiment très reconnaissant. Merci beaucoup de salutations cordiales",
      ),
      true,
    );
    assert.equal(
      isNoReplyNeeded(
        "Je m'excuse, si vous pouvez annuler le paiement, j'ai remarqué après que le disque ne convient pas",
      ),
      false,
    );
  });
});

describe("clientNeedsReply", () => {
  it("is false when seller wrote last", () => {
    assert.equal(
      clientNeedsReply({
        lastSenderIsClient: false,
        lastMessageText: "Fonctionnel ?",
      }),
      false,
    );
  });

  it("is false for courtesy client closings", () => {
    assert.equal(
      clientNeedsReply({
        lastSenderIsClient: true,
        lastMessageText: "Bonne journée",
      }),
      false,
    );
  });
});
