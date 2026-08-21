import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFromSelf,
  isOwnListing,
  latestIncomingBuyerText,
  resolveClientUsername,
  resolveSelfUsername,
  sideOfSender,
} from "./messageSides.js";

describe("messageSides", () => {
  it("uses auth username as self, not listing seller when both differ", () => {
    const self = resolveSelfUsername({
      authUsername: "aize-5",
      listingSeller: "snowwolfsas",
    });
    assert.equal(self, "aize-5");

    assert.equal(
      isFromSelf({ senderUsername: "aize-5", selfUsername: self }),
      true,
    );
    assert.equal(
      isFromSelf({ senderUsername: "snowwolfsas", selfUsername: self }),
      false,
    );
  });

  it("falls back to listing seller when auth is missing", () => {
    assert.equal(
      resolveSelfUsername({ listingSeller: "snowwolfsas" }),
      "snowwolfsas",
    );
  });

  it("resolves client as the other party", () => {
    const client = resolveClientUsername({
      selfUsername: "aize-5",
      participants: ["aize-5", "snowwolfsas"],
    });
    assert.equal(client, "snowwolfsas");
  });

  it("classifies sides correctly for mixed conversation", () => {
    const self = "aize-5";
    const client = "snowwolfsas";
    assert.equal(
      sideOfSender({
        senderUsername: "aize-5",
        selfUsername: self,
        clientUsername: client,
      }),
      "seller",
    );
    assert.equal(
      sideOfSender({
        senderUsername: "snowwolfsas",
        selfUsername: self,
        clientUsername: client,
      }),
      "client",
    );
  });

  it("detects when we are buyer on someone else's listing", () => {
    assert.equal(
      isOwnListing({
        authUsername: "aize-5",
        listingSeller: "autre-vendeur",
      }),
      false,
    );
    assert.equal(
      isOwnListing({
        authUsername: "aize-5",
        listingSeller: "aize-5",
      }),
      true,
    );
  });

  it("ignores our own photo request when finding incoming buyer text", () => {
    const text = latestIncomingBuyerText({
      selfUsername: "aize-5",
      messages: [
        {
          senderUsername: "aize-5",
          messageBody: "bonjour est il possible d'avoir davantage de photo ?",
          createdDate: "2026-08-06T12:23:00.000Z",
        },
        {
          senderUsername: "autre-vendeur",
          messageBody: "Bonjour, que recherchez-vous ?",
          createdDate: "2026-08-06T11:00:00.000Z",
        },
      ],
    });
    assert.equal(text, "Bonjour, que recherchez-vous ?");
  });
});
