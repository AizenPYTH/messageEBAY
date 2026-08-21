import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeConversationSummary } from "./messageApi.js";

describe("normalizeConversationSummary", () => {
  it("reads camelCase unreadCount from eBay", () => {
    const c = normalizeConversationSummary({
      conversationId: "c1",
      unreadCount: 5,
      conversationStatus: "ACTIVE",
    });
    assert.equal(c.unreadCount, 5);
  });

  it("reads itemId as referenceId fallback", () => {
    const c = normalizeConversationSummary({
      conversation_id: "c3",
      itemId: "318028116955",
    });
    assert.equal(c.referenceId, "318028116955");
  });
});
