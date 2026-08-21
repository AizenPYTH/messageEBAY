import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeMessage } from "../analysis/analyzeMessage.js";
import { buildFactPack, formatFactPackSection } from "./buildFactPack.js";

describe("formatFactPackSection", () => {
  it("tells the model to answer every message in a buyer burst", () => {
    const pack = buildFactPack({
      plan: analyzeMessage("RAM ?"),
      pendingBuyerMessages: [
        {
          messageId: "1",
          senderUsername: "red_thef0",
          messageBody:
            "s’il s’agit bien du OnePlus Nord CE, et non du Nord N10 5G ?",
        },
        {
          messageId: "2",
          senderUsername: "red_thef0",
          messageBody: "Et la capacité de RAM et de stockage?",
        },
      ],
      latestText: "Et la capacité de RAM et de stockage?",
      currentAsk:
        "s’il s’agit bien du OnePlus Nord CE, et non du Nord N10 5G ?\nEt la capacité de RAM et de stockage?",
    });
    const block = formatFactPackSection(pack);
    assert.match(block, /CHAQUE point/i);
    assert.match(block, /Nord CE/i);
    assert.match(block, /RAM/i);
    assert.doesNotMatch(block, /Réponds UNIQUEMENT à ça/i);
  });
});
