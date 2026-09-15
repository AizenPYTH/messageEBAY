import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ListingDetails } from "../ebay/tradingApi.js";
import {
  hasUnknownInclusionAsk,
  isInclusionAsk,
  replyInventedInclusion,
  resolveInclusionAsk,
} from "./inclusionAsk.js";
import { detectAllListingTopics } from "./listingEvidence.js";
import { extractAskedProductPhrase } from "../catalog/searchCatalog.js";
import { allowFactualShortcut } from "./factualShortcut.js";
import { assessReplyQuality } from "../ai/replyQuality.js";

const topcase: ListingDetails = {
  itemId: "1",
  title:
    "Keyboard topcase clavier QWERTY SWEDEN APPLE MacBook PRO 13 2020 A2338 M1GRIS",
  itemSpecifics: [],
  variations: [],
  shippingOptions: [],
  rawAvailable: true,
};

describe("inclusionAsk", () => {
  it("detects Touch Bar / trackpad inclusion questions", () => {
    assert.equal(
      isInclusionAsk(
        "Bonjour, ce top case fonctionne-t-il correctement et comprend également une barre tactile et un trackpad ?",
      ),
      true,
    );
    assert.equal(
      isInclusionAsk(
        "Peut-être en avez-vous un qui comprend la Touch Bar et le trackpad ?",
      ),
      true,
    );
    assert.equal(isInclusionAsk("C'est dispo ?"), false);
    assert.equal(isInclusionAsk("Le trackpad fonctionne ?"), false);
  });

  it("is unknown when the listing title does not mention those parts", () => {
    const ask =
      "Bonjour, ce top case fonctionne-t-il correctement et comprend également une barre tactile et un trackpad ?";
    assert.equal(hasUnknownInclusionAsk({ message: ask, listing: topcase }), true);
    const r = resolveInclusionAsk({ message: ask, listing: topcase });
    assert.ok(r.asked.some((p) => p.id === "touchbar" && p.verdict === "unknown"));
    assert.ok(r.asked.some((p) => p.id === "trackpad" && p.verdict === "unknown"));
  });

  it("is yes when the listing text names the parts", () => {
    const ask = "comprend la Touch Bar et le trackpad ?";
    const r = resolveInclusionAsk({
      message: ask,
      listing: {
        ...topcase,
        title: "Topcase A2338 avec Touch Bar et trackpad",
      },
    });
    assert.equal(r.hasUnknown, false);
    assert.ok(r.asked.every((p) => p.verdict === "yes"));
  });

  it("does not treat inclusion as a catalog product phrase", () => {
    const follow =
      "Peut-être en avez-vous un qui comprend la Touch Bar et le trackpad ?";
    assert.equal(extractAskedProductPhrase(follow), null);
    assert.equal(allowFactualShortcut(follow), false);
    assert.ok(!detectAllListingTopics(follow).includes("available"));
  });

  it("flags the invented just-the-top-case denial", () => {
    assert.equal(
      replyInventedInclusion({
        ask: "comprend également une barre tactile et un trackpad ?",
        listing: topcase,
        reply:
          "Yes, it is fully functional. However, please note that it does not include the Touch Bar and trackpad, as it is just the top case.",
      }),
      true,
    );
  });
});
