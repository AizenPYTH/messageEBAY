import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifySellerCase,
  formatAskPackagingPhotos,
  formatPartialRefundOffer,
  formatWrongAddressCancel,
  isExteriorPackagingDamage,
  isPostPurchaseDamageClaim,
  buyerSentPhotos,
  parseListingPrice,
  isBuyerReturnShipped,
  isShipTodayPhrase,
} from "./sellerCase.js";

describe("classifySellerCase", () => {
  it("flags photo requests as to-handle, no auto reply", () => {
    const c = classifySellerCase({
      latestText: "Pouvez-vous m'envoyer une photo ?",
    });
    assert.equal(c.kind, "photo_request");
    assert.equal(c.needsSellerIntervention, true);
    assert.match(c.summaryFr, /photos/i);
    assert.equal(c.autoReplyKind, undefined);
  });

  it("asks for photos on exterior packaging damage (no litige)", () => {
    const c = classifySellerCase({
      latestText: "Le carton est abîmé à l'extérieur !!",
    });
    assert.equal(c.kind, "exterior_packaging_damage");
    assert.equal(c.needsSellerIntervention, false);
    assert.equal(c.autoReplyKind, "ask_packaging_photos");
  });

  it("wrong address: seller can cancel, never eBay-only", () => {
    const c = classifySellerCase({
      latestText:
        "je me suis trompé d'adresse est ce que vous pouvez changer l'adresse ou j'annule",
    });
    assert.equal(c.kind, "wrong_address_or_cancel");
    assert.equal(c.autoReplyKind, "wrong_address_cancel");
    assert.equal(c.needsSellerIntervention, false);
    const reply = formatWrongAddressCancel({
      mentionsAddress: true,
    });
    assert.match(reply, /annuler la commande directement/i);
    assert.doesNotMatch(reply, /ebay.*(annul|doit)/i);
  });

  it("alerts when buyer sends photos", () => {
    const c = classifySellerCase({
      latestText: "Voici les photos du colis",
    });
    assert.equal(c.kind, "buyer_photos_received");
    assert.equal(c.needsSellerIntervention, true);
  });

  it("flags return label requests", () => {
    const c = classifySellerCase({
      latestText: "Merci de m'envoyer un bordereau de retour",
    });
    assert.equal(c.kind, "return_label_request");
    assert.equal(c.needsSellerIntervention, true);
    assert.equal(c.autoReplyKind, undefined);
    assert.match(c.summaryFr, /bordereau|bon de retour/i);
  });

  it("gives Marseille address only when the buyer asks for it", () => {
    const c = classifySellerCase({
      latestText: "Bonjour, quelle est votre adresse pour renvoyer l'écran ?",
    });
    assert.equal(c.kind, "return_address_ask");
    assert.equal(c.needsSellerIntervention, false);
    assert.equal(c.autoReplyKind, "return_address");
  });

  it("escalates a return wish without giving an address", () => {
    const c = classifySellerCase({
      latestText: "Je voudrais retourner l'écran LCD APPLE ORIGINAL",
    });
    assert.equal(c.kind, "refund_or_return_request");
    assert.equal(c.needsSellerIntervention, true);
    assert.equal(c.autoReplyKind, undefined);
  });

  it("flags bon de retour the same as bordereau — no auto reply", () => {
    const c = classifySellerCase({
      latestText: "Pouvez-vous m'envoyer un bon de retour svp ?",
    });
    assert.equal(c.kind, "return_label_request");
    assert.equal(c.needsSellerIntervention, true);
    assert.equal(c.autoReplyKind, undefined);
  });

  it("invoice request: alert seller, no auto promise", () => {
    const c = classifySellerCase({
      latestText:
        "Bonjour nous transmettre facture urgent svp votre image ne s'ouvre pas merci",
    });
    assert.equal(c.kind, "invoice_request");
    assert.equal(c.needsSellerIntervention, true);
    assert.equal(c.autoReplyKind, undefined);
  });

  it("local pickup: refuse auto, shipping only", () => {
    const c = classifySellerCase({
      latestText: "Bonjour, c'est possible de le recuperer demain dans la matinée.",
    });
    assert.equal(c.kind, "local_pickup");
    assert.equal(c.needsSellerIntervention, false);
    assert.equal(c.autoReplyKind, "refuse_pickup");
  });

  it("color preference return: no prepaid label, auto reply", () => {
    const c = classifySellerCase({
      latestText:
        "Bonjour, l'écran est bien arrivé mais la couleur ne correspond pas, il me fallait un gris et non un argenté, désolé puis-je vous le retourner. Merci",
    });
    assert.equal(c.kind, "color_preference_return");
    assert.equal(c.needsSellerIntervention, false);
    assert.equal(c.autoReplyKind, "color_preference_return");
  });

  it("color + bordereau in the same ask still auto-refuses prepaid label", () => {
    const c = classifySellerCase({
      latestText:
        "la couleur ne correspond pas, il me fallait un gris et non un argenté\nPouvez-vous m'envoyer le bordereau de retour dans la journée svp",
    });
    assert.equal(c.kind, "color_preference_return");
    assert.equal(c.autoReplyKind, "color_preference_return");
  });

  it("never auto-offers a refund on damaged items — alert only", () => {
    const c = classifySellerCase({
      latestText: "J'ai reçu l'écran cassé",
      listingPrice: "120.00",
    });
    assert.equal(c.kind, "damaged_item_manual");
    assert.equal(c.needsSellerIntervention, true);
    assert.equal(c.autoReplyKind, undefined);
  });

  it("escalates refund asks without promising money", () => {
    const c = classifySellerCase({
      latestText: "Je veux un remboursement complet",
    });
    assert.equal(c.kind, "refund_or_return_request");
    assert.equal(c.needsSellerIntervention, true);
  });

  it("escalates cheap received damaged items instead of inventing an offer", () => {
    const c = classifySellerCase({
      latestText: "Pièce cassée à l'arrivée",
      listingPrice: "12",
    });
    assert.equal(c.kind, "damaged_item_manual");
    assert.equal(c.needsSellerIntervention, true);
  });

  it("does NOT offer 10% on pre-sale questions about a broken / untested listing", () => {
    const c = classifySellerCase({
      latestText:
        "Bonjour mon mac est cassé, l'écran de votre annonce qui ne s'allume pas (pas pu tester) marche-t-il ou c'est juste la carte mère ?",
      listingPrice: "350",
    });
    assert.equal(c.kind, "none");
    assert.equal(c.autoReplyKind, undefined);
    assert.equal(c.needsSellerIntervention, false);
  });

  it("escalates when buyer refuses gesture and wants a label", () => {
    const c = classifySellerCase({
      sellerUsername: "seller1",
      listingPrice: "120",
      messages: [
        {
          messageId: "1",
          senderUsername: "buyer1",
          messageBody: "Reçu cassé",
        },
        {
          messageId: "2",
          senderUsername: "seller1",
          messageBody:
            "Bonjour, je vous propose un geste commercial de 10 % sur le prix d'achat.",
        },
      ],
      latestText: "Non, je veux un bordereau de retour",
    });
    // Bordereau always wins → no auto reply (same outcome as refused gesture).
    assert.equal(c.kind, "return_label_request");
    assert.equal(c.needsSellerIntervention, true);
    assert.equal(c.autoReplyKind, undefined);
  });
});

describe("isExteriorPackagingDamage / buyerSentPhotos", () => {
  it("detects exterior packaging", () => {
    assert.equal(isExteriorPackagingDamage("carton abîmé"), true);
    assert.equal(isExteriorPackagingDamage("emballage endommagé"), true);
    assert.equal(buyerSentPhotos("Voici les photos"), true);
    assert.equal(buyerSentPhotos("Fonctionnel ?"), false);
  });
});

describe("isPostPurchaseDamageClaim", () => {
  it("accepts received damage", () => {
    assert.equal(isPostPurchaseDamageClaim("J'ai reçu l'écran cassé"), true);
  });

  it("accepts received flexgate / screen that turns off when fully open", () => {
    assert.equal(
      isPostPurchaseDamageClaim(
        "Bonjour Écran reçu ce matin Montage sans soucis mais problème de flexgate sur l'écran L'écran s'allume entre ouvert et s'éteint à l'ouverture complète",
      ),
      true,
    );
  });

  it("escalates a flexgate follow-up instead of another diagnostic", () => {
    const c = classifySellerCase({
      latestText:
        "Oui le problème persiste malgré tout Quelle solution pouvons nous trouver pour régler se problème ?",
      sellerUsername: "snowwolfsas",
      messages: [
        {
          senderUsername: "buyer",
          messageBody:
            "Écran reçu ce matin problème de flexgate L'écran s'éteint à l'ouverture complète",
        },
        {
          senderUsername: "snowwolfsas",
          messageBody:
            "Je vous recommande de vérifier les câbles. Si le problème persiste nous pouvons envisager d'autres solutions.",
        },
      ],
    });
    assert.equal(c.kind, "damaged_item_manual");
    assert.equal(c.needsSellerIntervention, true);
    assert.equal(c.autoReplyKind, undefined);
  });

  it("rejects pre-sale compatibility / untested listing questions", () => {
    assert.equal(
      isPostPurchaseDamageClaim(
        "mon mac est cassé, est-ce que l'écran marche si le mac ne s'allume pas",
      ),
      false,
    );
  });

  it("never auto-replies when someone tries to sell us a lot", () => {
    const first = classifySellerCase({
      latestText:
        "I currently have a lot of server memory modules for sale and wanted to check if you might be interested. The lot includes: HPE 16GB. If you're interested, please feel free to make me an offer for the entire lot.",
    });
    assert.equal(first.kind, "inbound_sell_offer");
    assert.equal(first.needsSellerIntervention, true);
    assert.equal(first.autoReplyKind, undefined);

    const followUp = classifySellerCase({
      latestText: "My price for all is 1500€ it’s ok for you ?",
      sellerUsername: "SNOWOLF",
      messages: [
        {
          senderUsername: "nylwn",
          messageBody:
            "I currently have a lot of server memory modules for sale and wanted to check if you might be interested.",
        },
        {
          senderUsername: "SNOWOLF",
          messageBody: "Please let me know your asking price",
        },
        {
          senderUsername: "nylwn",
          messageBody: "My price for all is 1500€ it’s ok for you ?",
        },
      ],
    });
    assert.equal(followUp.kind, "inbound_sell_offer");
    assert.equal(followUp.needsSellerIntervention, true);
  });

  it("does not treat a buyer asking our listing price as selling to us", () => {
    const c = classifySellerCase({
      latestText: "Meilleur prix ? Vous faites une offre ?",
    });
    assert.notEqual(c.kind, "inbound_sell_offer");
  });

  it("escalates when the buyer already shipped a return with tracking", () => {
    const first = classifySellerCase({
      latestText: "lol non, j ai envoyez le retour ce jour :) XM022217049TS",
    });
    assert.equal(first.kind, "buyer_return_shipped");
    assert.equal(first.needsSellerIntervention, true);

    const followUp = classifySellerCase({
      latestText: "envoyez ce jour cdlt",
      sellerUsername: "SNOWOLF",
      messages: [
        {
          senderUsername: "buyer1",
          messageBody: "lol non, j ai envoyez le retour ce jour :) XM022217049TS",
        },
        {
          senderUsername: "SNOWOLF",
          messageBody:
            "Je ne peux pas expédier aujourd'hui, stock indisponible.",
        },
        {
          senderUsername: "buyer1",
          messageBody: "envoyez ce jour cdlt",
        },
      ],
    });
    assert.equal(followUp.kind, "buyer_return_shipped");
    assert.equal(followUp.needsSellerIntervention, true);
  });
});

describe("isBuyerReturnShipped / isShipTodayPhrase", () => {
  it("catches typos j ai envoyez + Colissimo id", () => {
    assert.equal(
      isBuyerReturnShipped(
        "lol non, j ai envoyez le retour ce jour :) XM022217049TS",
      ),
      true,
    );
  });

  it("treats envoyez ce jour as a ship-today phrase, not stock", () => {
    assert.equal(isShipTodayPhrase("envoyez ce jour cdlt"), true);
    assert.equal(isShipTodayPhrase("C'est dispo ?"), false);
  });
});

describe("parseListingPrice", () => {
  it("parses french and decimal prices", () => {
    assert.equal(parseListingPrice("120,50"), 120.5);
    assert.equal(parseListingPrice("89.00 EUR"), 89);
  });
});

describe("formatPartialRefundOffer", () => {
  it("stays short and explicit about 10%", () => {
    const text = formatPartialRefundOffer({
      languageCode: "fr",
      signature: "Cordialement,",
    });
    assert.match(text, /10\s*%/);
    assert.match(text, /Cordialement/);
    assert.doesNotMatch(text, /bordereau/i);
  });
});

describe("formatAskPackagingPhotos", () => {
  it("asks for packaging photos without litige", () => {
    const text = formatAskPackagingPhotos({ languageCode: "fr" });
    assert.match(text, /photos/i);
    assert.match(text, /emballage|carton/i);
    assert.doesNotMatch(text, /litige|retour|paypal/i);
  });
});
