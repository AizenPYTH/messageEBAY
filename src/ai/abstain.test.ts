import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAbstainReply, NO_REPLY_SENTINEL } from "./abstain.js";

describe("isAbstainReply", () => {
  it("detects empty and NO_REPLY", () => {
    assert.equal(isAbstainReply(""), true);
    assert.equal(isAbstainReply("   "), true);
    assert.equal(isAbstainReply(NO_REPLY_SENTINEL), true);
    assert.equal(isAbstainReply("NO_REPLY"), true);
    assert.equal(isAbstainReply("NO_REPLY — pas assez d'info"), true);
    assert.equal(isAbstainReply("[NO_REPLY]"), true);
  });

  it("keeps real seller replies", () => {
    assert.equal(
      isAbstainReply("Bonjour,\n\nOui c'est dispo.\n\nCordialement,\nSNOWOLF"),
      false,
    );
  });
});
