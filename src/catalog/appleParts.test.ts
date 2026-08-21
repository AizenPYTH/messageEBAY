import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  extractApplePartNumbers,
  titleIsMultiAppleModel,
  variationMentionsApplePart,
  askedFinishDiffersFromListing,
  extractAskedFinish,
} from "./appleParts.js";
import {
  buildApplePartsReply,
  evaluatePartOnListing,
} from "./applePartsStock.js";
import type { ListingDetails } from "../ebay/tradingApi.js";

describe("extractApplePartNumbers", () => {
  it("extracts A2338 and A1466 from buyer message", () => {
    const parts = extractApplePartNumbers(
      "bonjour est ce que l'écran macbook A2338 est tjr dispo ? et aussi le A1466 dispo ?",
    );
    assert.deepEqual(parts, ["A2338", "A1466"]);
  });
});

describe("askedFinishDiffersFromListing", () => {
  it("sees gris vs Argenté on the same A2338", () => {
    assert.equal(
      extractAskedFinish("un autre A2338 grade A en gris sidéral").color,
      "gris",
    );
    assert.equal(
      askedFinishDiffersFromListing(
        "Auriez-vous un autre A2338 grade A en gris sidéral au même tarif",
        "Écran LCD Retina 13,3 pour MacBook Pro A2338 M1 2020 Argenté Grade A",
      ),
      true,
    );
    assert.equal(
      askedFinishDiffersFromListing(
        "il est tjr dispo ?",
        "Écran LCD Retina 13,3 A2338 Argenté Grade A",
      ),
      false,
    );
  });
});

describe("titleIsMultiAppleModel", () => {
  it("detects multi-model screen titles", () => {
    assert.equal(
      titleIsMultiAppleModel(
        "ECRAN LCD MACBOOK A2681 _A1466 - A1706 - A1932 - A2337 - A2338 - A2289",
      ),
      true,
    );
    assert.equal(
      titleIsMultiAppleModel(
        "Écran LCD Complet Apple MacBook Pro Retina 13 A2338 Gris",
      ),
      false,
    );
  });
});

describe("evaluatePartOnListing (multi-model)", () => {
  const multiListing: ListingDetails = {
    itemId: "123",
    title:
      "ECRAN LCD MACBOOK A2681 _A1466 - A1706 - A1932 - A2337 - A2338 - A2289 - A2179 -",
    quantityAvailable: 11,
    itemSpecifics: [],
    variations: [
      {
        quantity: 0,
        quantitySold: 0,
        quantityAvailable: 0,
        specifics: [{ name: "MODEL", value: "MACBOOK PRO M1 A2338 SILVER" }],
      },
      {
        quantity: 4,
        quantitySold: 0,
        quantityAvailable: 4,
        specifics: [{ name: "MODEL", value: "MACBOOK AIR A1466 2013 2017" }],
      },
      {
        quantity: 1,
        quantitySold: 0,
        quantityAvailable: 1,
        specifics: [{ name: "MODEL", value: "MACBOOK AIR A2179 SILVER" }],
      },
    ],
    shippingOptions: [],
    rawAvailable: true,
  };

  it("says A2338 OOS without offering A2179", () => {
    const a2338 = evaluatePartOnListing(multiListing, "A2338");
    assert.equal(a2338?.available, false);
    assert.equal(a2338?.quantity, 0);
    assert.equal(a2338?.hit, undefined);
  });

  it("says A1466 in stock on same listing", () => {
    const a1466 = evaluatePartOnListing(multiListing, "A1466");
    assert.equal(a1466?.available, true);
    assert.equal(a1466?.quantity, 4);
    assert.equal(a1466?.hit?.itemId, "123");
  });

  it("returns null for a part not on this listing", () => {
    assert.equal(evaluatePartOnListing(multiListing, "A9999"), null);
  });

  it("variationMentionsApplePart matches MODEL value", () => {
    assert.equal(
      variationMentionsApplePart(multiListing.variations[0]!, "A2338"),
      true,
    );
    assert.equal(
      variationMentionsApplePart(multiListing.variations[0]!, "A1466"),
      false,
    );
  });
});

describe("buildApplePartsReply", () => {
  it("says clear yes/no per part, never hedge or offer other models", () => {
    const result = buildApplePartsReply({
      parts: [
        {
          part: "A1466",
          available: true,
          quantity: 4,
          hit: {
            itemId: "1",
            title: "ÉCRAN LCD A1466",
            quantityAvailable: 4,
            itemUrl: "https://www.ebay.fr/itm/1",
            score: 10,
          },
        },
        { part: "A2338", available: false, quantity: 0 },
      ],
      shippingText: "envoi le jour même avant 15h (sauf samedi et dimanche)",
    });
    assert.match(result.reply, /A1466 oui dispo/i);
    assert.match(result.reply, /A2338 plus en stock malheureusement/i);
    assert.doesNotMatch(result.reply, /vérifier|confirmé|A2337|A2681|A2179/i);
    assert.match(result.reply, /avant 15h/i);
    assert.match(result.reply, /SNOWOLF/);
  });

  it("does not paste a link when the part is the current listing", () => {
    const result = buildApplePartsReply({
      parts: [
        {
          part: "A1466",
          available: true,
          quantity: 2,
          hit: {
            itemId: "318028116955",
            title: "Carte E/S Apple 820-3455-A A1466",
            quantityAvailable: 2,
            itemUrl: "https://www.ebay.fr/itm/318028116955",
            score: 10,
          },
        },
      ],
      currentItemId: "318028116955",
    });
    assert.doesNotMatch(result.reply, /ebay\.fr\/itm/i);
  });

  it("offers Grade B at Grade A price when Grade A gris is OOS", () => {
    const result = buildApplePartsReply({
      parts: [
        {
          part: "A2338",
          available: true,
          quantity: 1,
          askedLabel: "A2338 Grade A gris sidéral",
          samePriceDowngrade: true,
          hit: {
            itemId: "318028154749",
            title: "Écran LCD Complet Apple MacBook Pro Retina 13 A2338 Gris GRADE B",
            quantityAvailable: 1,
            itemUrl: "https://www.ebay.fr/itm/318028154749",
            score: 40,
          },
        },
      ],
    });
    assert.match(result.reply, /Grade B/i);
    assert.match(result.reply, /même prix/i);
    assert.match(result.reply, /318028154749/);
    assert.doesNotMatch(result.reply, /satisfaction/i);
  });
});

