import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectListingFacts } from "./selectListingFacts.js";
import type { ListingDetails } from "../ebay/tradingApi.js";

const listing: ListingDetails = {
  itemId: "318028116955",
  title: "Batterie MacBook Air A1466",
  price: "29",
  currency: "EUR",
  condition: "Occasion",
  listingStatus: "Active",
  quantityAvailable: 4,
  dispatchTimeMax: "0",
  itemSpecifics: [],
  variations: [],
  shippingOptions: [
    { service: "FR_Tracked", cost: "0.0", international: false },
    { service: "EU_Standard", cost: "8.50", international: true },
  ],
  descriptionText: "Batterie compatible A1466 2013-2017. Testée.",
  rawAvailable: true,
};

describe("selectListingFacts", () => {
  it("for a stock/battery ask does not dump shipping rates", () => {
    const facts = selectListingFacts(
      listing,
      "Bonjour, vous avez encore la batterie ?",
    ).join("\n");
    assert.match(facts, /Stock dispo/);
    assert.doesNotMatch(facts, /EU_Standard/);
    assert.doesNotMatch(facts, /8\.50/);
  });

  it("for a shipping ask includes rates and omits price dump of description", () => {
    const facts = selectListingFacts(
      listing,
      "Existe-t-il une livraison à 0 € ?",
    ).join("\n");
    assert.match(facts, /Livraison/);
    assert.doesNotMatch(facts, /Batterie compatible A1466 2013-2017/);
  });

  it("for a price ask includes price, not shipping", () => {
    const facts = selectListingFacts(listing, "C'est combien ?").join("\n");
    assert.match(facts, /29/);
    assert.doesNotMatch(facts, /EU_Standard/);
  });

  it("for a repair listing includes untested fact line and title specs", () => {
    const repair: ListingDetails = {
      ...listing,
      title: "OnePlus 6T 256Go 8Go RAM – Écran LCD Cassé – Pour Réparation",
      descriptionText: "Vendu pour pièces. Écran cassé.",
    };
    const facts = selectListingFacts(
      repair,
      "L’écran tactile fonctionne-t-il ? Le port USB-C ? Le bootloader ? La batterie ?",
    ).join("\n");
    assert.match(facts, /réparation/i);
    assert.match(facts, /ne teste pas/i);
    assert.match(facts, /256Go 8Go RAM/i);
    assert.doesNotMatch(facts, /je ne peux pas fournir/i);
  });

  it("for a générique Grade A ask explains aftermarket and that it works", () => {
    const screen: ListingDetails = {
      ...listing,
      title:
        "Écran LCD Retina 13,3 pour MacBook Pro A1989 2018-2019 Gris Grade A Générique",
      descriptionText: "Écran compatible Grade A, testé.",
      dispatchTimeMax: "0",
    };
    const facts = selectListingFacts(
      screen,
      "Pouvez-vous me préciser ce que vous entendez par : gris Grade A « Générique » ?",
    ).join("\n");
    assert.match(facts, /pas une pièce originale Apple/i);
    assert.match(facts, /ça marche/i);
    assert.doesNotMatch(facts, /DispatchTimeMax/);
    assert.doesNotMatch(facts, /Livraison/);
  });

  it("for an auction flags no Buy It Now", () => {
    const facts = selectListingFacts(
      {
        ...listing,
        listingType: "Chinese",
        price: "35.0",
        buyItNowPrice: undefined,
      },
      "Achat immédiat possible ?",
    ).join("\n");
    assert.match(facts, /ENCHÈRE/i);
    assert.match(facts, /PAS d'achat immédiat/i);
  });
});
