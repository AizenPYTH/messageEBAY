import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseIphoneModel,
  variationIsAskedIphone,
  extractSamsungBoardCode,
  extractSamsungBoardCodes,
  askedSamsungSkuDiffersFromListing,
  phoneBrandsClash,
} from "./phoneModel.js";

describe("parseIphoneModel", () => {
  it("keeps Pro Max as a distinct SKU from 11 and 11 Pro", () => {
    assert.equal(
      parseIphoneModel("Vous avez un écran iPhone 11 pro Max ?")?.label,
      "iPhone 11 Pro Max",
    );
    assert.equal(parseIphoneModel("écran iPhone 11")?.label, "iPhone 11");
    assert.equal(parseIphoneModel("iPhone 11 Pro")?.label, "iPhone 11 Pro");
    assert.equal(parseIphoneModel("11 Pro Max")?.label, "iPhone 11 Pro Max");
    assert.equal(parseIphoneModel("11")?.label, "iPhone 11");
  });

  it("does not steal Surface / MacBook asks", () => {
    assert.equal(parseIphoneModel("Vous avez le Surface Pro 8 ?"), null);
    assert.equal(
      parseIphoneModel("bonjour écran surface pro 8 est dispo ?"),
      null,
    );
    assert.equal(parseIphoneModel("MacBook Pro 14"), null);
  });

  it("does not steal Samsung Galaxy A13 / A137F as iPhone 13", () => {
    assert.equal(
      parseIphoneModel("Vous avez un écran Samsung a 13 4g modèle a137F?"),
      null,
    );
    assert.equal(
      parseIphoneModel("Non je vous ai dit Samsung Galaxy à 13 4g modèle137F"),
      null,
    );
    assert.equal(parseIphoneModel("écran Galaxy A13 A135F"), null);
  });
});

describe("extractSamsungBoardCode", () => {
  it("reads A137F from a137F and glued modèle137F", () => {
    assert.equal(
      extractSamsungBoardCode("Vous avez un écran Samsung a 13 4g modèle a137F?"),
      "A137F",
    );
    assert.equal(
      extractSamsungBoardCode("Samsung Galaxy à 13 4g modèle137F"),
      "A137F",
    );
    assert.deepEqual(
      extractSamsungBoardCodes("Ecran Complet Galaxy A13 4G (A135F)"),
      ["A135F"],
    );
  });

  it("treats A135F and A137F as different SKUs", () => {
    assert.equal(
      askedSamsungSkuDiffersFromListing(
        "écran Samsung a 13 4g modèle a137F",
        "Ecran Complet Galaxy A13 4G (A135F) (Avec châssis)",
      ),
      true,
    );
    assert.equal(
      askedSamsungSkuDiffersFromListing(
        "écran A135F ?",
        "Ecran Complet Galaxy A13 4G (A135F)",
      ),
      false,
    );
  });

  it("does not match iPhone listings against a Samsung ask", () => {
    assert.equal(
      phoneBrandsClash(
        "écran Samsung a 13 4g modèle a137F",
        "Ecran Complet iPhone 13",
      ),
      true,
    );
    assert.equal(
      phoneBrandsClash(
        "écran Samsung A137F",
        "Ecran Complet Galaxy A13 4G (A135F)",
      ),
      false,
    );
  });
});

describe("variationIsAskedIphone", () => {
  const asked = parseIphoneModel("iPhone 11 Pro Max")!;

  it("matches 11 Pro Max even when the spec blob has extra words", () => {
    assert.equal(variationIsAskedIphone(asked, "11 Pro Max"), true);
    assert.equal(variationIsAskedIphone(asked, "Modèle 11 Pro Max Noir"), true);
    assert.equal(variationIsAskedIphone(asked, "11"), false);
    assert.equal(variationIsAskedIphone(asked, "11 Pro"), false);
    assert.equal(variationIsAskedIphone(asked, "12 Pro Max"), false);
  });

  it("matches plain 11 only against the 11 SKU", () => {
    const eleven = parseIphoneModel("écran iPhone 11")!;
    assert.equal(variationIsAskedIphone(eleven, "11"), true);
    assert.equal(variationIsAskedIphone(eleven, "11 Pro Max"), false);
  });
});
