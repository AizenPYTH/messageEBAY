import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  alreadyRepliedAwaitingBuyer,
  draftAlreadySentInThread,
  isForeignSellerListing,
  isNearDuplicateReply,
  looksLikeOurSellerReply,
  ourRepliesSinceIncoming,
  weInitiatedContact,
} from "./alreadyReplied.js";

const CANCEL =
  "Bonjour,\nOui je peux annuler la commande directement de mon côté. Vous confirmez l'annulation ?\nCordialement,\nSNOWOLF";

describe("looksLikeOurSellerReply", () => {
  it("detects SNOWOLF signature and cancel template", () => {
    assert.equal(looksLikeOurSellerReply(CANCEL), true);
    assert.equal(looksLikeOurSellerReply("C'est dispo ?"), false);
  });
});

describe("alreadyRepliedAwaitingBuyer", () => {
  it("stops when the last messages are the same auto-reply", () => {
    const messages = [
      {
        senderUsername: "luca",
        messageBody: "je me suis trompé d'adresse, vous pouvez annuler ?",
        createdDate: "2026-08-19T04:00:00.000Z",
      },
      {
        senderUsername: "snowwolfsas",
        messageBody: CANCEL,
        createdDate: "2026-08-19T05:26:00.000Z",
      },
      {
        senderUsername: "snowwolfsas",
        messageBody: CANCEL,
        createdDate: "2026-08-19T06:06:00.000Z",
      },
      {
        senderUsername: "snowwolfsas",
        messageBody: CANCEL,
        createdDate: "2026-08-19T08:29:00.000Z",
      },
    ];
    assert.equal(
      alreadyRepliedAwaitingBuyer({
        messages,
        selfUsernames: ["aize-5"],
      }),
      true,
    );
    assert.equal(
      ourRepliesSinceIncoming({ messages, selfUsernames: ["aize-5"] }),
      3,
    );
  });

  it("does not stop when the buyer wrote after us", () => {
    const messages = [
      {
        senderUsername: "snowwolfsas",
        messageBody: CANCEL,
        createdDate: "2026-08-19T05:26:00.000Z",
      },
      {
        senderUsername: "luca",
        messageBody: "oui merci annulez",
        createdDate: "2026-08-19T09:00:00.000Z",
      },
    ];
    assert.equal(
      alreadyRepliedAwaitingBuyer({
        messages,
        selfUsernames: ["snowwolfsas"],
      }),
      false,
    );
  });
});

describe("draftAlreadySentInThread", () => {
  it("matches the cancel spam", () => {
    assert.equal(
      draftAlreadySentInThread({
        draft: CANCEL,
        messages: [
          { senderUsername: "x", messageBody: CANCEL, createdDate: "2026-08-19T05:26:00.000Z" },
        ],
      }),
      true,
    );
    assert.equal(
      isNearDuplicateReply(CANCEL, CANCEL.replace("Bonjour,", "Bonjour ,")),
      true,
    );
  });

  it("catches the same conformité pep talk with small wording changes", () => {
    const a =
      "Nous allons tester la conformité de l'écran LCD Retina 13,3\" avant l'envoi afin de garantir qu'il répond bien aux critères de qualité d'un produit Grade A. Votre satisfaction est notre priorité et nous mettons tout en œuvre pour vous fournir un écran en très bon état, adapté au remplacement de votre écran d'origine.";
    const b =
      "Nous allons tester la conformité de l'écran LCD Retina 13,3\" avant l'envoi pour nous assurer qu'il répond bien aux critères de qualité d'un produit Grade A. Vous pouvez être rassuré que nous mettons un point d'honneur à vous fournir un écran en très bon état, adapté au remplacement de votre écran d'origine.";
    assert.equal(isNearDuplicateReply(a, b), true);
  });
});

describe("weInitiatedContact / foreign listing", () => {
  it("detects when we wrote first to another seller", () => {
    assert.equal(
      weInitiatedContact({
        selfUsernames: ["snowwolfsas"],
        messages: [
          {
            senderUsername: "snowwolfsas",
            messageBody: "bonjour est il possible d'avoir davantage de photo ?",
            createdDate: "2026-08-06T12:23:00.000Z",
          },
          {
            senderUsername: "autre-vendeur",
            messageBody: "Bonjour, que recherchez-vous ?",
            createdDate: "2026-08-06T13:00:00.000Z",
          },
        ],
      }),
      true,
    );
    assert.equal(
      isForeignSellerListing({
        authUsername: "snowwolfsas",
        listingSeller: "autre-vendeur",
      }),
      true,
    );
    assert.equal(
      isForeignSellerListing({
        authUsername: "snowwolfsas",
        listingSeller: "snowwolfsas",
      }),
      false,
    );
  });

  it("is false when a buyer wrote first on our listing", () => {
    assert.equal(
      weInitiatedContact({
        selfUsernames: ["snowwolfsas"],
        messages: [
          {
            senderUsername: "luca",
            messageBody: "C'est dispo ?",
            createdDate: "2026-08-19T08:00:00.000Z",
          },
        ],
      }),
      false,
    );
  });
});
