import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareIdentities,
  describeIdentity,
  extractAskedIdentity,
  extractModelCodes,
  identityMatchesText,
  isGenericPartWord,
} from "./identity.js";

const A135F_TITLE = "Ecran Complet Galaxy A13 4G (A135F) (Avec châssis)";

describe("extractAskedIdentity", () => {
  it("reads a Samsung ask the parser used to ignore entirely", () => {
    const id = extractAskedIdentity("Vous avez un écran Samsung a 13 4g modèle a137F?");
    assert.equal(id?.brand, "samsung");
    assert.equal(id?.family, "galaxy");
    assert.equal(id?.base, "a13");
    assert.deepEqual(id?.codes, ["A137F"]);
  });

  it("keeps Pro Max instead of truncating to Pro", () => {
    const id = extractAskedIdentity("Vous avez un écran iPhone 11 Pro Max ?");
    assert.equal(id?.family, "iphone");
    assert.equal(id?.base, "11");
    assert.deepEqual(id?.qualifiers, ["pro", "max"]);
  });

  it("reads a glued model number", () => {
    const id = extractAskedIdentity("Non je vous ai dit Samsung Galaxy à 13 4g modèle137F");
    assert.equal(id?.brand, "samsung");
    assert.equal(id?.base, "a13");
    assert.deepEqual(id?.codes, ["137F"]);
  });

  it("returns null when no product is named", () => {
    assert.equal(extractAskedIdentity("Bonjour, c'est toujours dispo ?"), null);
  });
});

describe("compareIdentities", () => {
  it("A137F is not A135F", () => {
    const asked = extractAskedIdentity("écran Samsung a 13 4g modèle a137F");
    const listing = extractAskedIdentity(A135F_TITLE);
    assert.equal(compareIdentities(asked, listing), "mismatch");
  });

  it("the buyer's truncated code still matches the full one", () => {
    const asked = extractAskedIdentity("Samsung Galaxy a13 modèle137F");
    const listing = extractAskedIdentity("Ecran Galaxy A13 4G (SM-A137F)");
    assert.equal(compareIdentities(asked, listing), "match");
  });

  it("iPhone 11 Pro Max is not iPhone 11", () => {
    const asked = extractAskedIdentity("écran iPhone 11 Pro Max");
    const listing = extractAskedIdentity("Ecran iPhone 11 (Incell)");
    assert.equal(compareIdentities(asked, listing), "mismatch");
  });

  it("iPhone 11 Pro Max matches its own listing", () => {
    const asked = extractAskedIdentity("écran iPhone 11 Pro Max");
    const listing = extractAskedIdentity("Ecran Complet iPhone 11 Pro Max (Incell)");
    assert.equal(compareIdentities(asked, listing), "match");
  });

  it("Galaxy A13 is not an iPhone 13", () => {
    const asked = extractAskedIdentity("écran Samsung Galaxy A13 4G");
    const listing = extractAskedIdentity("Ecran Complet iPhone 13 (Incell)");
    assert.equal(compareIdentities(asked, listing), "mismatch");
  });

  it("Redmi 7 is not Redmi Note 7", () => {
    const asked = extractAskedIdentity("écran Redmi Note 7");
    const listing = extractAskedIdentity("Ecran Complet Noir Redmi 7 (avec châssis)");
    assert.equal(compareIdentities(asked, listing), "mismatch");
  });
});

describe("identityMatchesText", () => {
  it("says mismatch on the thread that went wrong", () => {
    const asked = extractAskedIdentity("Vous avez un écran Samsung a 13 4g modèle a137F?");
    assert.equal(identityMatchesText(asked, A135F_TITLE), "mismatch");
    assert.equal(
      identityMatchesText(asked, "Ecran Complet iPhone 13 (Incell)"),
      "mismatch",
    );
    assert.equal(
      identityMatchesText(asked, "Ecran Complet Noir Redmi 7 (avec châssis)"),
      "mismatch",
    );
  });

  it("matches one model of a multi-model title", () => {
    const asked = extractAskedIdentity("écran iPhone 11 Pro Max");
    assert.equal(
      identityMatchesText(asked, "Ecran iPhone 11 / 11 Pro / 11 Pro Max"),
      "match",
    );
  });

  it("does not claim a match when the title names nothing", () => {
    const asked = extractAskedIdentity("écran iPhone 11 Pro Max");
    assert.equal(identityMatchesText(asked, "Ecran complet neuf avec châssis"), "unknown");
  });
});

describe("extractModelCodes", () => {
  it("reads Apple and Samsung codes, which the old guard could not", () => {
    assert.deepEqual(extractModelCodes("MacBook A1989"), ["A1989"]);
    assert.deepEqual(extractModelCodes("Galaxy A137F"), ["A137F"]);
    assert.deepEqual(extractModelCodes("SM-A135F"), ["A135F"]);
  });
});

describe("isGenericPartWord", () => {
  it("knows which words describe the part and not the product", () => {
    for (const word of ["écran", "coque", "batterie", "modèle", "noir"]) {
      assert.equal(isGenericPartWord(word), true, word);
    }
    for (const word of ["iphone", "galaxy", "a137f", "redmi"]) {
      assert.equal(isGenericPartWord(word), false, word);
    }
  });
});

describe("describeIdentity", () => {
  it("is readable in an alert", () => {
    const id = extractAskedIdentity("écran Samsung a 13 4g modèle a137F");
    assert.match(describeIdentity(id), /A137F/);
  });
});
