import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BrowseSearchResult } from "../ebay/browseApi.js";
import { resolveCodeFromMarketplace } from "./referenceLookup.js";

function marketplace(titles: string[]) {
  return async (): Promise<BrowseSearchResult> => ({
    ok: true,
    items: titles.map((title, index) => ({ itemId: String(index), title })),
  });
}

describe("apprendre un code depuis le marché", () => {
  it("reads the product when the marketplace agrees with itself", async () => {
    const resolved = await resolveCodeFromMarketplace("A146B", {
      search: marketplace([
        "Ecran LCD Samsung Galaxy A14 5G SM-A146B Noir",
        "Vitre tactile Galaxy A14 5G A146B avec châssis",
        "Bloc écran Samsung Galaxy A14 5G (A146B) original",
        "Batterie Galaxy A14 5G A146B",
      ]),
    });
    assert.equal(resolved?.reference.brand, "samsung");
    assert.equal(resolved?.reference.base, "a14");
    assert.equal(resolved?.reference.network, "5g");
    assert.ok((resolved?.confidence ?? 0) >= 0.6);
  });

  it("records nothing when the marketplace disagrees", async () => {
    const resolved = await resolveCodeFromMarketplace("A146B", {
      search: marketplace([
        "Ecran Galaxy A14 5G A146B",
        "Ecran Galaxy A34 5G A146B",
        "Ecran Galaxy S22 Ultra A146B",
        "Ecran Redmi Note 11 A146B",
      ]),
    });
    assert.equal(resolved, null);
  });

  it("ignores titles that do not carry the code", async () => {
    const resolved = await resolveCodeFromMarketplace("A146B", {
      search: marketplace([
        "Ecran Galaxy A13 4G A135F",
        "Ecran Galaxy A13 4G A137F",
        "Ecran Galaxy A12 A125F",
      ]),
    });
    assert.equal(resolved, null);
  });

  it("ignores multi-model titles, which settle nothing", async () => {
    const resolved = await resolveCodeFromMarketplace("A146B", {
      search: marketplace([
        "Ecran A146B compatible Galaxy A14 / A14 5G / A13",
        "Ecran A146B pour Galaxy A14 / A34 / A54",
        "Ecran A146B Galaxy A14 / A24 / A34",
      ]),
    });
    assert.equal(resolved, null);
  });

  it("says nothing when the marketplace is unreachable", async () => {
    const resolved = await resolveCodeFromMarketplace("A146B", {
      search: async () => ({ ok: false, reason: "Browse timeout" }),
    });
    assert.equal(resolved, null);
  });
});
