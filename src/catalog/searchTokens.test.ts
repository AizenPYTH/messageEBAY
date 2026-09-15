import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractCatalogSearchTokens,
  isDistinctiveToken,
} from "./searchCatalog.js";

describe("catalog search tokens", () => {
  it("does not treat part words as product identifiers", () => {
    // "ecran" matches every screen in the shop — scoring on it is what put an
    // unrelated listing at the top of a Samsung question.
    for (const token of ["ecran", "complet", "chassis", "noir", "modele"]) {
      assert.equal(isDistinctiveToken(token), false, token);
    }
    for (const token of ["samsung", "a137f", "iphone", "redmi"]) {
      assert.equal(isDistinctiveToken(token), true, token);
    }
  });

  it("spends the SQL filter on the tokens that identify the product", () => {
    const tokens = extractCatalogSearchTokens(
      "Vous avez un écran Samsung a 13 4g modèle a137F?",
    );
    const firstGeneric = tokens.findIndex((t) => !isDistinctiveToken(t));
    const lastDistinctive = tokens.map(isDistinctiveToken).lastIndexOf(true);
    assert.ok(tokens.includes("a137f"));
    assert.ok(
      firstGeneric === -1 || firstGeneric > lastDistinctive,
      `distinctive tokens must come first: ${tokens.join(", ")}`,
    );
  });
});
