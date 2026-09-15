import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessReplyQuality } from "./replyQuality.js";
import type { ListingDetails } from "../ebay/tradingApi.js";

const listing: ListingDetails = {
  itemId: "1",
  title: "Batterie MacBook Air A1466",
  itemSpecifics: [],
  variations: [],
  shippingOptions: [],
  rawAvailable: true,
};

describe("assessReplyQuality", () => {
  it("rejects a shipping reply to a battery/stock question", () => {
    const qa = assessReplyQuality({
      currentAsk: "Bonjour, vous avez encore la batterie ?",
      reply:
        "Bonjour,\nNous proposons une livraison suivie à 0,0 EUR.\nCordialement,\nSNOWOLF",
      listing,
    });
    assert.equal(qa.ok, false);
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("off_topic"));
  });

  it("accepts a short stock answer", () => {
    const qa = assessReplyQuality({
      currentAsk: "vous avez encore la batterie ?",
      reply: "Bonjour,\nOui, la pièce est toujours disponible.\nCordialement,\nSNOWOLF",
      listing,
    });
    assert.equal(qa.ok, true);
    assert.equal(qa.block, false);
  });

  it("rejects a duplicate of the last seller message", () => {
    const reply =
      "Bonjour,\nOui je peux annuler la commande directement de mon côté. Vous confirmez l'annulation ?\nCordialement,\nSNOWOLF";
    const qa = assessReplyQuality({
      currentAsk: "vous pouvez annuler ?",
      reply,
      listing,
      messages: [
        {
          senderUsername: "snowwolfsas",
          messageBody: reply,
          createdDate: "2026-08-19T07:00:00.000Z",
        },
      ],
      selfUsernames: ["snowwolfsas"],
    });
    assert.equal(qa.issues.includes("duplicate"), true);
    assert.equal(qa.block, true);
  });

  it("flags a part number not in the listing or question", () => {
    const qa = assessReplyQuality({
      currentAsk: "c'est compatible ?",
      reply: "Bonjour,\nOui c'est pour le A2338.\nCordialement,\nSNOWOLF",
      listing,
      listingFactsText: "Titre : Batterie MacBook Air A1466",
    });
    assert.equal(qa.issues.includes("invented"), true);
  });

  it("blocks ChatGPT-style I cannot provide / check a reliable source", () => {
    const qa = assessReplyQuality({
      currentAsk:
        "Et pourriez-vous également me confirmer la capacité de RAM et de stockage?",
      reply:
        "Bonjour,\nJe ne peux pas fournir d'informations sur la capacité de RAM et de stockage pour le OnePlus Nord CE mentionné dans l'annonce. Je vous encourage à vérifier les spécifications techniques sur une source fiable.\nCordialement,\nSNOWOLF",
      listing: {
        ...listing,
        title: "OnePlus Nord CE – Redémarre en Boucle – Pour Réparation",
      },
    });
    assert.equal(qa.ok, false);
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("robotic"));
  });

  it("blocks untested hedge on a Grade A générique screen", () => {
    const screen: ListingDetails = {
      ...listing,
      title:
        "Écran LCD Retina 13,3 pour MacBook Pro A1989 2018-2019 Gris Grade A Générique",
    };
    const qa = assessReplyQuality({
      currentAsk:
        "Pouvez-vous me préciser ce que vous entendez par : gris Grade A « Générique » ?",
      reply:
        "Bonjour,\nLe terme « gris Grade A Générique » fait référence à un état général dit \"Grade A\", ce qui signifie que l'appareil présente des signes d'usure minimes. Nous ne testons pas toutes les fonctions de nos appareils, donc je ne peux pas garantir le fonctionnement de l'écran.\nCordialement,\nSNOWOLF",
      listing: screen,
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("invented"));
  });

  it("allows untested wording on a real for-repair listing", () => {
    const qa = assessReplyQuality({
      currentAsk: "Le tactile fonctionne ?",
      reply:
        "Bonjour,\nVendu pour réparation, on n'a pas tout testé — l'écran est cassé comme indiqué.\nCordialement,\nSNOWOLF",
      listing: {
        ...listing,
        title: "OnePlus 6T – Écran LCD Cassé – Pour Réparation",
      },
    });
    assert.equal(qa.issues.includes("invented"), false);
  });

  it("blocks a placeholder return address", () => {
    const qa = assessReplyQuality({
      currentAsk: "Je voudrais retourner l'écran",
      reply:
        "Bonjour,\nMerci pour votre message. Vous pouvez renvoyer l'écran à l'adresse suivante : [adresse à insérer ici].\nNous vous remercions de votre compréhension et restons disponibles pour toute autre question.\nCordialement,\nSNOWOLF",
      listing,
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("invented"));
  });

  it("blocks leaking the return address when not asked", () => {
    const qa = assessReplyQuality({
      currentAsk: "Je voudrais retourner l'écran",
      reply:
        "Bonjour,\nVous pouvez renvoyer à : 7 square Stalingrad 13001 Marseille.\nCordialement,\nSNOWOLF",
      listing,
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("invented"));
  });

  it("blocks same-day-only reply to Italy delivery ETA", () => {
    const qa = assessReplyQuality({
      currentAsk: "Quel est le délai de livraison estimé pour l'Italie ?",
      reply:
        "Bonjour,\nenvoi le jour même avant 15h (sauf samedi et dimanche)\nCordialement,\nSNOWOLF",
      listing,
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("misses_question"));
  });

  it("blocks a flexgate technician lecture", () => {
    const qa = assessReplyQuality({
      currentAsk:
        "Écran reçu ce matin problème de flexgate l'écran s'éteint à l'ouverture complète",
      reply:
        "Bonjour,\nJe suis désolé. Je vous recommande de consulter un professionnel. Nous pourrions envisager des options. Merci de me tenir informé de l'évolution de la situation.\nCordialement,\nSNOWOLF",
      listing,
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("robotic"));
  });
});

describe("assessReplyQuality — modèle demandé", () => {
  it("blocks the reply that offered an iPhone on a Samsung question", () => {
    const qa = assessReplyQuality({
      reply: [
        "Bonjour,",
        "",
        "Oui le écran est tjr dispo, envoi le jour même avant 15h (sauf samedi et dimanche). Oui on a iPhone 13 en stock, voici le lien : https://www.ebay.fr/itm/318081183144",
        "",
        "Cordialement,",
        "SNOWOLF",
      ].join("\n"),
      currentAsk: "Vous avez un écran Samsung a 13 4g modèle a137F?",
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("model_mismatch"));
  });

  it("allows explaining which model the listing actually is", () => {
    const qa = assessReplyQuality({
      reply:
        "Bonjour,\n\nNon, sur cette annonce c'est le A135F, je n'ai pas le A137F.\n\nCordialement,\nSNOWOLF",
      currentAsk: "Vous avez un écran Samsung a 13 4g modèle a137F?",
      listingFactsText: "Ecran Complet Galaxy A13 4G (A135F)",
    });
    assert.ok(!qa.issues.includes("model_mismatch"));
  });

  it("allows the right model", () => {
    const qa = assessReplyQuality({
      reply:
        "Bonjour,\n\nOui on a l'écran Galaxy A13 4G A137F en stock, voici le lien : https://www.ebay.fr/itm/1\n\nCordialement,\nSNOWOLF",
      currentAsk: "Vous avez un écran Samsung a 13 4g modèle a137F?",
    });
    assert.ok(!qa.issues.includes("model_mismatch"));
  });
});
