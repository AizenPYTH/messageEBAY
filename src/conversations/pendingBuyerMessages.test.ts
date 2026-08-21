import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectPendingBuyerMessages,
  joinPendingBuyerText,
  isTrivialBuyerAck,
  filterSubstantivePending,
  pendingTextForReply,
} from "./pendingBuyerMessages.js";

describe("collectPendingBuyerMessages", () => {
  it("collects all buyer messages after the last seller reply", () => {
    const pending = collectPendingBuyerMessages({
      selfUsername: "seller1",
      messages: [
        {
          messageId: "1",
          senderUsername: "buyer1",
          messageBody: "Bonjour",
          createdDate: "2026-08-07T10:00:00Z",
        },
        {
          messageId: "2",
          senderUsername: "seller1",
          messageBody: "Bonjour, je vous écoute.",
          createdDate: "2026-08-07T10:01:00Z",
        },
        {
          messageId: "3",
          senderUsername: "buyer1",
          messageBody: "C'est compatible iPhone 12 ?",
          createdDate: "2026-08-07T10:02:00Z",
        },
        {
          messageId: "4",
          senderUsername: "buyer1",
          messageBody: "Et il y a un chargeur ?",
          createdDate: "2026-08-07T10:02:30Z",
        },
        {
          messageId: "5",
          senderUsername: "buyer1",
          messageBody: "Vous pouvez envoyer demain ?",
          createdDate: "2026-08-07T10:03:00Z",
        },
      ],
    });
    assert.equal(pending.length, 3);
    assert.equal(
      joinPendingBuyerText(pending),
      "C'est compatible iPhone 12 ?\nEt il y a un chargeur ?\nVous pouvez envoyer demain ?",
    );
  });

  it("takes the whole buyer streak when seller never replied", () => {
    const pending = collectPendingBuyerMessages({
      selfUsername: "seller1",
      messages: [
        {
          senderUsername: "buyer1",
          messageBody: "Dispo ?",
          createdDate: "2026-08-07T10:00:00Z",
        },
        {
          senderUsername: "buyer1",
          messageBody: "Prix ferme ?",
          createdDate: "2026-08-07T10:01:00Z",
        },
      ],
    });
    assert.equal(pending.length, 2);
  });

  it("ignores thanks when building reply text after a real question", () => {
    const pending = collectPendingBuyerMessages({
      selfUsername: "seller1",
      messages: [
        {
          senderUsername: "seller1",
          messageBody: "à partir de 5€",
          createdDate: "2026-08-14T08:47:00Z",
        },
        {
          senderUsername: "buyer1",
          messageBody: "D'accord merci",
          createdDate: "2026-08-14T09:07:00Z",
        },
        {
          senderUsername: "buyer1",
          messageBody: "Juste elle et compatible partout ?",
          createdDate: "2026-08-14T10:50:00Z",
        },
      ],
    });
    assert.equal(pending.length, 2);
    assert.equal(isTrivialBuyerAck("D'accord merci"), true);
    assert.equal(filterSubstantivePending(pending).length, 1);
    assert.equal(
      pendingTextForReply(pending),
      "Juste elle et compatible partout ?",
    );
  });

  it("returns empty reply text when only trivial acks are pending", () => {
    const pending = collectPendingBuyerMessages({
      selfUsername: "seller1",
      messages: [
        {
          senderUsername: "seller1",
          messageBody: "Oui c'est dispo.",
          createdDate: "2026-08-14T08:47:00Z",
        },
        {
          senderUsername: "buyer1",
          messageBody: "Merci",
          createdDate: "2026-08-14T09:07:00Z",
        },
      ],
    });
    assert.equal(filterSubstantivePending(pending).length, 0);
    assert.equal(pendingTextForReply(pending), "");
  });
});
