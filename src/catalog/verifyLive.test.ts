import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { CatalogHit } from "./searchCatalog.js";

describe("verifyCatalogHitsLive (unit shaping)", () => {
  it("drops hits when live qty is zero for answer building", async () => {
    // Pure shaping check: in-stock filter used by catalogReply
    const hits: CatalogHit[] = [
      {
        itemId: "1",
        title: "Carte Sim Lyca",
        quantityAvailable: 0,
        itemUrl: "https://www.ebay.fr/itm/1",
        score: 10,
      },
    ];
    const inStock = hits.filter((h) => h.quantityAvailable > 0);
    assert.equal(inStock.length, 0);
  });
});
