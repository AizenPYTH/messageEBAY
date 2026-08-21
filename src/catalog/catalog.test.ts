import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { parseEbayActiveListingsCsv } from "./parseEbayCsv.js";
import { buildCatalogAvailabilityReply } from "./catalogReply.js";
import { extractCatalogSearchTokens } from "./searchCatalog.js";

describe("parseEbayActiveListingsCsv", () => {
  it("parses surface multi-variation listing with Pro 8 OOS", () => {
    const csv = `Item number;Title;Variation details;Custom label (SKU);Available quantity;Format;Currency;Start price;Auction Buy It Now price;Reserve price;Current price;Sold quantity;Watchers;Bids;Start date;End date;eBay category 1 name;eBay category 1 number;Condition
"1";"ecran surface pro";"MODEL=PRO 4;PRO 8";"SKU";"1";"FIXED_PRICE";"EUR";10.0;;;10.0;"0";"0";"0";"May-13-25";"Aug-13-26";"Autres";"1";"Neuf"
"1";"ecran surface pro";"MODEL=PRO 4";"a";"0";"FIXED_PRICE";"EUR";10.0;;;10.0;"0";"0";"0";"May-13-25";"Aug-13-26";"Autres";"1";"Neuf"
"1";"ecran surface pro";"MODEL=PRO 8";"b";"0";"FIXED_PRICE";"EUR";10.0;;;10.0;"0";"0";"0";"May-13-25";"Aug-13-26";"Autres";"1";"Neuf"
"1";"ecran surface pro";"MODEL=GO 1";"c";"1";"FIXED_PRICE";"EUR";10.0;;;10.0;"0";"0";"0";"May-13-25";"Aug-13-26";"Autres";"1";"Neuf"
"2";"Touchpad MacBook";" ";"x";"2";"FIXED_PRICE";"EUR";28.0;;;28.0;"0";"0";"0";"May-13-25";"Aug-13-26";"Autres";"1";"Neuf"
`;
    const listings = parseEbayActiveListingsCsv(csv);
    assert.equal(listings.length, 2);
    const surface = listings.find((l) => l.itemId === "1")!;
    assert.equal(surface.variations.length, 3);
    assert.equal(
      surface.variations.find((v) => v.specifics[0]?.value === "PRO 8")
        ?.quantityAvailable,
      0,
    );
    assert.equal(
      surface.variations.find((v) => v.specifics[0]?.value === "GO 1")
        ?.quantityAvailable,
      1,
    );
    assert.equal(surface.quantityAvailable, 1);
    const trackpad = listings.find((l) => l.itemId === "2")!;
    assert.equal(trackpad.quantityAvailable, 2);
    assert.equal(trackpad.variations.length, 0);
  });
});

describe("extractCatalogSearchTokens", () => {
  it("keeps surface pro model tokens", () => {
    const tokens = extractCatalogSearchTokens(
      "bonjour écran surface pro 8 est dispo ?",
    );
    assert.ok(tokens.includes("surface"));
    assert.ok(tokens.includes("pro") || tokens.includes("8"));
  });

  it("prioritizes product after avez-vous, ignores shipping words", () => {
    const tokens = extractCatalogSearchTokens(
      "quel est le delai de livraison ? avez vous des puces lyca ?",
    );
    assert.ok(tokens.includes("puces") || tokens.includes("lyca"));
    assert.ok(!tokens.includes("delai"));
    assert.ok(!tokens.includes("livraison"));
    assert.equal(tokens[0] === "puces" || tokens[0] === "lyca", true);
  });
});

describe("buildCatalogAvailabilityReply", () => {
  it("answers yes with link when catalog has stock", () => {
    const result = buildCatalogAvailabilityReply({
      message: "vous avez un touchpad macbook ?",
      askedLabel: "touchpad macbook",
      hits: [
        {
          itemId: "99",
          title: "Touchpad MacBook",
          quantityAvailable: 2,
          itemUrl: "https://www.ebay.fr/itm/99",
          score: 10,
        },
      ],
    });
    assert.equal(result.answerability, "direct_yes");
    assert.match(result.reply ?? "", /ebay\.fr\/itm\/99/);
    assert.match(result.reply ?? "", /tjr dispo|disponible/i);
  });

  it("says no for foreign product when catalog empty, keeps shipping", () => {
    const result = buildCatalogAvailabilityReply({
      message: "avez vous des puces lyca ?",
      askedLabel: "puces lyca",
      hits: [],
      foreignProductAsk: true,
      currentListingTitle: "Topcase Clavier QWERTY MacBook Pro 15",
      extraParts: ["envoi le jour même avant 15h (sauf samedi et dimanche)"],
    });
    assert.equal(result.answerability, "direct_no");
    assert.match(result.reply ?? "", /clavier.*tjr dispo/i);
    assert.match(result.reply ?? "", /avant 15h/i);
    assert.match(result.reply ?? "", /puces lyca|carte sim/i);
    assert.doesNotMatch(result.reply ?? "", /toujours disponible/i);
  });

  it("separates shipping on this listing from other-product catalog hit", () => {
    const result = buildCatalogAvailabilityReply({
      message: "délai ? avez vous des puces lyca ?",
      askedLabel: "puces lyca",
      foreignProductAsk: true,
      currentListingTitle: "Topcase Clavier QWERTY(USA) pour MacBook Pro 15″ A1990",
      extraParts: ["envoi le jour même avant 15h (sauf samedi et dimanche)"],
      hits: [
        {
          itemId: "318126245638",
          title: "Carte Sim Lyca Mobile PréPayée 0€ 5G",
          quantityAvailable: 634,
          itemUrl: "https://www.ebay.fr/itm/318126245638",
          score: 10,
        },
      ],
    });
    assert.equal(result.answerability, "direct_yes");
    assert.match(result.reply ?? "", /oui le clavier est tjr dispo/i);
    assert.match(result.reply ?? "", /avant 15h/i);
    assert.match(result.reply ?? "", /carte sim Lyca/i);
    assert.match(result.reply ?? "", /voici le lien/i);
    assert.match(result.reply ?? "", /318126245638/);
    assert.doesNotMatch(result.reply ?? "", /Pour le délai/i);
  });
});

describe("real csv smoke", () => {
  it("parses the downloaded seller export if present", () => {
    const path =
      "C:/Users/pain/Downloads/eBay-all-active-listings-report-2026-08-10-12337929344.csv";
    let text: string;
    try {
      text = readFileSync(path, "utf8");
    } catch {
      return;
    }
    const listings = parseEbayActiveListingsCsv(text);
    assert.ok(listings.length > 3000);
    const surface = listings.find((l) => l.itemId === "318028101832");
    assert.ok(surface);
    const pro8 = surface!.variations.find((v) =>
      v.specifics.some((s) => /pro\s*8/i.test(s.value)),
    );
    assert.ok(pro8);
    assert.equal(pro8!.quantityAvailable, 0);
  });
});
