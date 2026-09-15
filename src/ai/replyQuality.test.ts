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

  it("blocks je n'ai pas d'informations hedges", () => {
    const qa = assessReplyQuality({
      currentAsk: "Quelle est la garantie ?",
      reply:
        "Bonjour,\nJe n'ai pas d'informations concernant la garantie.\nCordialement,\nSNOWOLF",
      listing,
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("robotic"));
  });

  it("blocks any reply to an invoice ask including fake sent claims", () => {
    const qa = assessReplyQuality({
      currentAsk: "Pouvez-vous m'envoyer la facture ?",
      reply:
        "Bonjour,\nJe vous ai envoyé la facture.\nCordialement,\nSNOWOLF",
      listing,
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("invented"));
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

  it("blocks catalog stock links on an existing-order ask", () => {
    const qa = assessReplyQuality({
      currentAsk:
        "Bonjour avez vous des retours par rapport à ma commande ? Merci",
      reply:
        "Bonjour,\nOui on a retours par rapport à ma commande en stock, voici le lien : https://www.ebay.fr/itm/318028167867\nCordialement,\nSNOWOLF",
      listing: {
        ...listing,
        title:
          "Gris sidéral Keyboard topcase clavier QWERTY DNK Macbook Pro 14 A2442/A2779",
      },
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("off_topic"));
  });

  it("blocks a wrong listing link when the buyer asks to ship their order", () => {
    const qa = assessReplyQuality({
      currentAsk: "Bonjour pouvez vous expédier ce que je vous ai commandé ? Merci",
      reply:
        "Bonjour,\nOui on a informations de suivi sur la commande svp en stock, voici le lien : https://www.ebay.fr/itm/318028124902\nCordialement,\nSNOWOLF",
      listing: {
        ...listing,
        title:
          "Gris sidéral Keyboard topcase clavier QWERTY DNK Macbook Pro 14 A2442/A2779",
      },
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("off_topic"));
  });

  it("blocks invented no-Touch-Bar on a topcase listing that does not say so", () => {
    const qa = assessReplyQuality({
      currentAsk:
        "Bonjour, ce top case fonctionne-t-il correctement et comprend également une barre tactile et un trackpad ?",
      reply:
        "Yes, it is fully functional. However, please note that it does not include the Touch Bar and trackpad, as it is just the top case.\nCordialement,\nSNOWOLF",
      listing: {
        ...listing,
        title:
          "Keyboard topcase clavier QWERTY SWEDEN APPLE MacBook PRO 13 2020 A2338 M1GRIS",
      },
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("invented"));
  });

  it("blocks a cancel-confirm after the buyer already closed with thanks", () => {
    const qa = assessReplyQuality({
      currentAsk:
        "Je m'excuse beaucoup pour la confusion que j'ai créée. Je vous en suis vraiment très reconnaissant. Merci beaucoup de salutations cordiales",
      reply:
        "Bonjour,\nOui je peux annuler la commande directement de mon côté. Vous confirmez l'annulation ?\nCordialement,\nSNOWOLF",
      listing,
      messages: [
        {
          senderUsername: "snowwolfsas",
          messageBody: "Bonjour,\nD'accord, votre commande sera annulée.\nBien cordialement,",
          createdDate: "2026-09-01T08:13:00.000Z",
        },
      ],
      selfUsernames: ["snowwolfsas"],
    });
    assert.equal(qa.block, true);
    assert.ok(
      qa.issues.includes("off_topic") || qa.issues.includes("duplicate"),
    );
  });

  it("blocks invented Buy It Now on an auction listing", () => {
    const qa = assessReplyQuality({
      currentAsk: "Achat immédiat possible ?",
      reply:
        "Oui, l'achat est possible immédiatement pour l'Apple iPhone SE 2020.\nCordialement,\nSNOWOLF",
      listing: {
        ...listing,
        title: "Apple iPhone SE 2020 64Go Rouge – Batterie 74% – Fonctionnel",
        listingType: "Chinese",
        price: "35.0",
        currency: "EUR",
      },
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("invented"));
  });

  it("blocks a shipping-rates reply to quel prix", () => {
    const qa = assessReplyQuality({
      currentAsk: "Quel prix merci",
      reply:
        "Les frais d'envoi sont ceux de l'annonce : 0 € (France) / LaPosteColissimoInternational 15,0 EUR (étranger). Je ne peux pas les modifier.\nCordialement,\nSNOWOLF",
      listing: {
        ...listing,
        listingType: "Chinese",
        price: "35.0",
        currency: "EUR",
      },
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("off_topic"));
  });

  it("blocks legal negotiation jargon and a wrong Grade A", () => {
    const qa = assessReplyQuality({
      currentAsk: "quels serait votre marge de négociation ?",
      reply:
        "Je suis désolé, mais la négociation de prix n'est pas autorisée pour cet écran. Le tarif affiché est le prix final.\nCordialement,\nSNOWOLF",
      listing: {
        ...listing,
        title: 'ÉCRAN LCD COMPLET POUR MACBOOK PRO 16" A2485 A2780 GRIS GRADE B',
        price: "459.00",
        currency: "EUR",
      },
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("robotic"));

    const grade = assessReplyQuality({
      currentAsk: "bonjour disponible? quels serait votre dernier prix",
      reply:
        "Je suis disponible pour discuter du prix de l'ÉCRAN LCD COMPLET POUR MACBOOK PRO 16\" A2485 A2780 GRIS GRADE A.\nMerci de me faire part de votre proposition.\nCordialement,\nSNOWOLF",
      listing: {
        ...listing,
        title: 'ÉCRAN LCD COMPLET POUR MACBOOK PRO 16" A2485 A2780 GRIS GRADE B',
      },
    });
    assert.equal(grade.block, true);
    assert.ok(grade.issues.includes("invented") || grade.issues.includes("robotic"));
  });

  it("blocks an iPhone catalog link on a Samsung Galaxy A13 ask", () => {
    const qa = assessReplyQuality({
      currentAsk: "Vous avez un écran Samsung a 13 4g modèle a137F?",
      reply:
        "Bonjour,\nOui le écran est tjr dispo, envoi le jour même avant 15h (sauf samedi et dimanche). Oui on a iPhone 13 en stock, voici le lien : https://www.ebay.fr/itm/318081183144\nCordialement,\nSNOWOLF",
      listing: {
        ...listing,
        title: "Ecran Complet Galaxy A13 4G (A135F) (Avec châssis)",
      },
    });
    assert.equal(qa.block, true);
    assert.ok(qa.issues.includes("off_topic"));
  });
});
