import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseReplyReasoning } from "./reasonThenReply.js";

describe("parseReplyReasoning", () => {
  it("parses clean JSON", () => {
    const r = parseReplyReasoning(
      '{"asks":["suivi"],"factsToUse":["livré"],"mustAvoid":["litige"],"outline":"confirmer livraison"}',
    );
    assert.ok(r);
    assert.equal(r!.outline, "confirmer livraison");
    assert.deepEqual(r!.mustAvoid, ["litige"]);
  });

  it("parses JSON embedded in prose", () => {
    const r = parseReplyReasoning(
      'Voici mon analyse:\n{"asks":["x"],"factsToUse":[],"mustAvoid":[],"outline":"répondre"}\nfin',
    );
    assert.ok(r);
    assert.equal(r!.outline, "répondre");
  });
});
