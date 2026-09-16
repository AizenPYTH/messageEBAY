import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canAssertSameProduct,
  compareIdentities,
  extractAskedIdentity,
} from "./identity.js";
import {
  codesForProduct,
  identityForCode,
  referenceForCode,
  unknownCodesIn,
  PRODUCT_REFERENCES,
} from "./references.js";

describe("table de références", () => {
  it("resolves a code to its product, prefix or not", () => {
    assert.equal(referenceForCode("A137F")?.label, "Galaxy A13 4G");
    assert.equal(referenceForCode("SM-A137F")?.label, "Galaxy A13 4G");
    assert.equal(referenceForCode("A1989")?.label, "MacBook Pro 13 Touch Bar (2018-2019)");
    assert.equal(referenceForCode("ZZ999Z"), null);
  });

  it("knows when a product name covers several codes", () => {
    assert.deepEqual(
      codesForProduct({
        brand: "samsung",
        family: "galaxy",
        base: "a13",
        network: "4g",
      }),
      ["A135F", "A137F"],
    );
    assert.deepEqual(
      codesForProduct({ brand: "samsung", family: "galaxy", base: "s23", qualifiers: ["ultra"] }),
      ["S918B"],
    );
  });

  it("has no duplicate codes", () => {
    const seen = new Set<string>();
    for (const reference of PRODUCT_REFERENCES) {
      assert.equal(seen.has(reference.code), false, `doublon ${reference.code}`);
      seen.add(reference.code);
    }
  });

  it("turns a code into something the matcher can compare", () => {
    const identity = identityForCode("A2338");
    assert.equal(identity?.family, "macbook pro");
    assert.equal(identity?.base, "13");
  });

  it("reports codes it does not know yet", () => {
    assert.deepEqual(unknownCodesIn("Ecran Galaxy A13 (A137F) et (A999Z)"), ["A999Z"]);
  });
});

describe("une affirmation demande une preuve, pas une absence de contradiction", () => {
  const codedAsk = extractAskedIdentity(
    "vous avez l'écran Samsung Galaxy A13 4G modèle A137F ?",
  );

  it("stays silent when the listing never says which code it is", () => {
    // "Galaxy A13 4G" is A135F *and* A137F — the title cannot answer.
    assert.equal(
      canAssertSameProduct(codedAsk, "Ecran Complet Galaxy A13 4G (Avec châssis)"),
      false,
    );
  });

  it("answers when the code is in the item specifics rather than the title", () => {
    assert.equal(
      canAssertSameProduct(
        codedAsk,
        "Ecran Complet Galaxy A13 4G \n Modele compatible SM-A137F",
      ),
      true,
    );
  });

  it("answers when the product name pins down a single code", () => {
    const ask = extractAskedIdentity("écran Galaxy S21 Ultra G998B");
    assert.equal(canAssertSameProduct(ask, "Ecran Complet Galaxy S21 Ultra"), true);
  });

  it("still answers a vague ask from a precise listing", () => {
    const vague = extractAskedIdentity("vous avez un écran MacBook Pro 13 ?");
    assert.equal(canAssertSameProduct(vague, "Ecran MacBook Pro 13 A1989 Argent"), true);
  });

  it("keeps brand as the first and hardest test", () => {
    assert.equal(
      compareIdentities(codedAsk, extractAskedIdentity("Ecran Complet iPhone 13")),
      "mismatch",
    );
  });

  it("does not answer an A1989 question from an unlabelled MacBook Pro 13", () => {
    // Seven different screens carry that name.
    const ask = extractAskedIdentity("un écran MacBook Pro 13 A1989");
    assert.equal(canAssertSameProduct(ask, "Ecran MacBook Pro 13 Argent"), false);
    assert.equal(canAssertSameProduct(ask, "Ecran MacBook Pro 13 A1989"), true);
    assert.equal(canAssertSameProduct(ask, "Ecran MacBook Pro 16 A2141"), false);
  });
});
