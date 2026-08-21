import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectCandidateItemIds,
  isLikelyEbayItemId,
} from "./resolveListingRef.js";

describe("collectCandidateItemIds", () => {
  it("uses LISTING referenceId", () => {
    assert.deepEqual(
      collectCandidateItemIds({
        conversationId: "123675136302",
        referenceId: "318028116955",
        referenceType: "LISTING",
      }),
      ["318028116955"],
    );
  });

  it("does not treat the conversation id as an item id", () => {
    assert.deepEqual(
      collectCandidateItemIds({
        conversationId: "123675136302",
        conversationTitle: "Question 123675136302",
      }),
      [],
    );
  });

  it("extracts /itm/ links from messages", () => {
    const ids = collectCandidateItemIds({
      conversationId: "123675136302",
      messageBodies: [
        "Voici https://www.ebay.fr/itm/318028116955 merci",
      ],
    });
    assert.deepEqual(ids, ["318028116955"]);
  });

  it("ignores ORDER reference ids that are not listing-shaped", () => {
    assert.deepEqual(
      collectCandidateItemIds({
        conversationId: "1",
        referenceId: "12-34567-89012",
        referenceType: "ORDER",
      }),
      [],
    );
  });
});

describe("isLikelyEbayItemId", () => {
  it("accepts 9–12 digit ids", () => {
    assert.equal(isLikelyEbayItemId("318028116955"), true);
    assert.equal(isLikelyEbayItemId("12-345"), false);
  });
});
