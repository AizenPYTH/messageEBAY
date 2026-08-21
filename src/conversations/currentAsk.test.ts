import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { selectCurrentBuyerAsk } from "./currentAsk.js";

describe("selectCurrentBuyerAsk", () => {
  it("keeps a Nord CE-style burst (model then RAM, 2 minutes later)", () => {
    const ask = selectCurrentBuyerAsk([
      {
        messageId: "1",
        senderUsername: "red_thef0",
        messageBody:
          "Bonjour, Pourriez-vous me confirmer s’il s’agit bien du OnePlus Nord CE (modèle original), et non du Nord N10 5G ou du Nord N100 ?",
        createdDate: "2026-08-19T08:36:00.000Z",
      },
      {
        messageId: "2",
        senderUsername: "red_thef0",
        messageBody:
          "Et pourriez-vous également me confirmer la capacité de RAM et de stockage?",
        createdDate: "2026-08-19T08:38:00.000Z",
      },
    ]);
    assert.equal(ask.messages.length, 2);
    assert.match(ask.text, /Nord CE/i);
    assert.match(ask.text, /RAM/i);
    assert.match(ask.lastText, /RAM/i);
  });

  it("keeps a same-minute burst (stock then shipping)", () => {
    const ask = selectCurrentBuyerAsk([
      {
        messageId: "1",
        senderUsername: "luca",
        messageBody: "Bonjour, il est encore disponible ?",
        createdDate: "2026-08-19T08:00:00.000Z",
      },
      {
        messageId: "2",
        senderUsername: "luca",
        messageBody: "Et vous pouvez l'envoyer demain ?",
        createdDate: "2026-08-19T08:00:40.000Z",
      },
    ]);
    assert.equal(ask.messages.length, 2);
    assert.match(ask.text, /disponible/i);
    assert.match(ask.text, /demain/i);
    assert.match(ask.lastText, /demain/i);
  });

  it("drops an old unanswered topic when a new question arrives hours later", () => {
    const ask = selectCurrentBuyerAsk([
      {
        messageId: "1",
        senderUsername: "luca",
        messageBody: "Vous faites les retours ?",
        createdDate: "2026-08-19T01:00:00.000Z",
      },
      {
        messageId: "2",
        senderUsername: "luca",
        messageBody: "vous avez encore la batterie ?",
        createdDate: "2026-08-19T10:00:00.000Z",
      },
    ]);
    assert.equal(ask.messages.length, 1);
    assert.match(ask.text, /batterie/i);
    assert.doesNotMatch(ask.text, /retours/i);
  });

  it("ignores merci in the pending streak", () => {
    const ask = selectCurrentBuyerAsk([
      {
        messageId: "1",
        senderUsername: "luca",
        messageBody: "C'est dispo ?",
        createdDate: "2026-08-19T10:00:00.000Z",
      },
      {
        messageId: "2",
        senderUsername: "luca",
        messageBody: "Ok merci",
        createdDate: "2026-08-19T10:00:20.000Z",
      },
    ]);
    assert.equal(ask.messages.length, 1);
    assert.match(ask.text, /dispo/i);
  });
});
