import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatPickupRefuse,
  formatColorPreferenceRefuse,
  formatReturnAddressReply,
  isInvoiceAsk,
  isLocalPickupAsk,
  isColorPreferenceReturn,
  isRepairListing,
  isOemGenericAsk,
  isReturnAddressAsk,
  listingIsAftermarketPart,
  replyHasPlaceholder,
  workingPartFactLine,
  SELLER_RETURN_ADDRESS,
} from "./sellerOps.js";

describe("isLocalPickupAsk", () => {
  it("detects récupérer demain matin", () => {
    assert.equal(
      isLocalPickupAsk("Bonjour, c'est possible de le recuperer demain dans la matinée."),
      true,
    );
    assert.equal(isLocalPickupAsk("je passe le prendre en main propre"), true);
    assert.equal(isLocalPickupAsk("C'est dispo ?"), false);
    assert.equal(
      isLocalPickupAsk("le colis est à récupérer au point relais"),
      false,
    );
  });
});

describe("isInvoiceAsk", () => {
  it("detects facture TVA and stays silent-worthy", () => {
    assert.equal(
      isInvoiceAsk(
        "Bonjour nous transmettre facture urgent svp votre image ne s'ouvre pas merci",
      ),
      true,
    );
    assert.equal(
      isInvoiceAsk("merci de transmettre facture avec TVA pour commande"),
      true,
    );
    assert.equal(isInvoiceAsk("C'est compatible A1466 ?"), false);
  });
});

describe("isRepairListing", () => {
  it("flags for-repair titles", () => {
    assert.equal(
      isRepairListing("OnePlus Nord CE – Redémarre en Boucle – Pour Réparation"),
      true,
    );
    assert.equal(
      isRepairListing("OnePlus 6T 256Go 8Go RAM – Écran LCD Cassé – Pour Réparation"),
      true,
    );
    assert.equal(isRepairListing("Ecran LCD MacBook A1502 Grade B"), false);
  });

  it("does not treat working spare parts as untested", () => {
    assert.equal(
      isRepairListing(
        "Carte E/S Apple 820-3455-A pour MacBook Air 13 A1466 (2013–2017) –Pièce détaché",
      ),
      false,
    );
    assert.equal(
      isRepairListing(
        "Écran LCD Retina 13,3 pour MacBook Pro A1989 2018-2019 Gris Grade A Générique",
      ),
      false,
    );
  });
});

describe("oem / générique", () => {
  it("detects a générique / officiel Apple question", () => {
    assert.equal(
      isOemGenericAsk(
        "Pouvez-vous me préciser ce que vous entendez par : gris Grade A « Générique » ?",
      ),
      true,
    );
    assert.equal(
      isOemGenericAsk(
        "j'ai cru que Générique voulait dire que ce n'était pas un produit officiel Apple",
      ),
      true,
    );
    assert.equal(isOemGenericAsk("C'est compatible A1466 ?"), false);
  });

  it("treats générique screens as aftermarket working parts", () => {
    const title =
      "Écran LCD Retina 13,3 pour MacBook Pro A1989 2018-2019 Gris Grade A Générique";
    assert.equal(listingIsAftermarketPart(title), true);
    const line = workingPartFactLine(
      title,
      "Pouvez-vous me préciser ce que vous entendez par : gris Grade A « Générique » ?",
    );
    assert.ok(line);
    assert.match(line!, /pas une pièce originale Apple/i);
    assert.match(line!, /ça marche/i);
    assert.match(line!, /ne teste pas/i);
  });
});

describe("formatPickupRefuse", () => {
  it("refuses pickup without offering a time slot", () => {
    const t = formatPickupRefuse({});
    assert.match(t, /pas de retrait/i);
    assert.doesNotMatch(t, /heure qui vous convient/i);
    assert.doesNotMatch(t, /n'hésitez pas/i);
  });
});

describe("isColorPreferenceReturn", () => {
  it("detects received wrong colour vs listed Argenté", () => {
    assert.equal(
      isColorPreferenceReturn(
        "Bonjour, l'écran est bien arrivé mais la couleur ne correspond pas, il me fallait un gris et non un argenté, désolé puis-je vous le retourner. Merci",
      ),
      true,
    );
    assert.equal(isColorPreferenceReturn("C'est dispo en gris ?"), false);
    const reply = formatColorPreferenceRefuse({ listingColor: "Argenté" });
    assert.match(reply, /Argenté/i);
    assert.match(reply, /pas de bordereau prépayé/i);
    assert.doesNotMatch(reply, /n'hésitez pas/i);
  });
});

describe("return address", () => {
  it("detects explicit address asks only", () => {
    assert.equal(
      isReturnAddressAsk("Quelle est votre adresse pour le retour ?"),
      true,
    );
    assert.equal(isReturnAddressAsk("où renvoyer l'écran ?"), true);
    assert.equal(isReturnAddressAsk("Je veux faire un retour"), false);
    assert.equal(isReturnAddressAsk("Merci de m'envoyer un bordereau"), false);
  });

  it("formats the real Marseille address without placeholders", () => {
    const reply = formatReturnAddressReply({});
    assert.match(reply, new RegExp(SELLER_RETURN_ADDRESS.replace(/ /g, "\\s+"), "i"));
    assert.doesNotMatch(reply, /\[|insérer|TODO/i);
  });

  it("flags template placeholders", () => {
    assert.equal(
      replyHasPlaceholder(
        "Vous pouvez renvoyer à l'adresse suivante : [adresse à insérer ici].",
      ),
      true,
    );
    assert.equal(
      replyHasPlaceholder(
        `Vous pouvez renvoyer à : ${SELLER_RETURN_ADDRESS}.`,
      ),
      false,
    );
  });
});
