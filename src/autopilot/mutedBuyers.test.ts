import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMutedBuyer } from "./mutedBuyers.js";

describe("isMutedBuyer", () => {
  it("mutes nylwn", () => {
    assert.equal(isMutedBuyer("nylwn"), true);
    assert.equal(isMutedBuyer("NYLWN"), true);
    assert.equal(isMutedBuyer("nylwn "), true);
  });

  it("does not mute other buyers", () => {
    assert.equal(isMutedBuyer("ducat80"), false);
    assert.equal(isMutedBuyer(""), false);
    assert.equal(isMutedBuyer(undefined), false);
  });
});
