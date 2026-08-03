import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isFromSelf,
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
});
