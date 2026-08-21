import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  allowFactualShortcut,
  blocksFactualShortcut,
  isBuyerOwnDeviceContext,
} from "./factualShortcut.js";
import { classifySellerCase } from "./sellerCase.js";
import { analyzeMessage } from "./analyzeMessage.js";

const MACBOOK_DIAG =
  "Bonjour, j'ai un Mac Book AIR 2017 A1466 qui ne s'allume plus. Je ne suis pas certain que le problème soit causé par la carte logique ou la carte d'E/S. Puis-je retourner si la cause n'est pas la carte d'E/S, mais la logique ?";

describe("factualShortcut", () => {
  it("blocks MacBook diagnosis + return policy ask", () => {
    assert.equal(isBuyerOwnDeviceContext(MACBOOK_DIAG), true);
    assert.equal(blocksFactualShortcut(MACBOOK_DIAG), true);
    assert.equal(allowFactualShortcut(MACBOOK_DIAG), false);
  });

  it("allows short stock ask", () => {
    assert.equal(allowFactualShortcut("Le A1466 est dispo ?"), true);
    assert.equal(allowFactualShortcut("Dispo ?"), true);
  });

  it("does not allow stock shortcut when asking return on own device", () => {
    assert.equal(allowFactualShortcut(MACBOOK_DIAG), false);
  });
});

describe("MacBook A1466 diagnosis integration", () => {
  it("classifies as refund/return — no auto stock reply", () => {
    const c = classifySellerCase({ latestText: MACBOOK_DIAG });
    assert.equal(c.kind, "refund_or_return_request");
    assert.equal(c.needsSellerIntervention, true);
  });

  it("intent is return_request not closed stock question", () => {
    const plan = analyzeMessage(MACBOOK_DIAG);
    assert.equal(plan.intent, "return_request");
    assert.notEqual(plan.intent, "closed_question");
  });
});
