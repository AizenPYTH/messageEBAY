import type { EbayMessage } from "../ebay/messageApi.js";
import { isNoReplyNeeded } from "../analysis/needsReply.js";
import { isFromSelf } from "./messageSides.js";

/**
 * Buyer messages still awaiting a seller reply: everything after the last
 * message from us (or the whole thread if we never replied).
 */
export function collectPendingBuyerMessages(input: {
  messages: EbayMessage[];
  selfUsername?: string;
}): EbayMessage[] {
  const chronological = [...input.messages].sort((a, b) => {
    const ta = a.createdDate ? Date.parse(a.createdDate) : 0;
    const tb = b.createdDate ? Date.parse(b.createdDate) : 0;
    return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
  });

  let lastSelfIndex = -1;
  for (let i = 0; i < chronological.length; i += 1) {
    if (
      isFromSelf({
        senderUsername: chronological[i]?.senderUsername,
        selfUsername: input.selfUsername,
      })
    ) {
      lastSelfIndex = i;
    }
  }

  return chronological
    .slice(lastSelfIndex + 1)
    .filter(
      (m) =>
        !isFromSelf({
          senderUsername: m.senderUsername,
          selfUsername: input.selfUsername,
        }) && Boolean(m.messageBody?.trim()),
    );
}

/** Pure ack / thanks / greeting — not a question to answer. */
export function isTrivialBuyerAck(text: string | undefined): boolean {
  return isNoReplyNeeded(text);
}

/** Pending messages that still need an answer (empty if only "ok merci"). */
export function filterSubstantivePending(
  messages: EbayMessage[],
): EbayMessage[] {
  return messages.filter((m) => !isTrivialBuyerAck(m.messageBody));
}

/** Join pending buyer messages for analysis / RAG (oldest → newest). */
export function joinPendingBuyerText(messages: EbayMessage[]): string {
  return messages
    .map((m) => m.messageBody?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
}

/**
 * Text used to decide what to answer: prefer substantive pending only,
 * so "D'accord merci" + a real question does not become a multi-topic essay.
 */
export function pendingTextForReply(messages: EbayMessage[]): string {
  return joinPendingBuyerText(filterSubstantivePending(messages));
}
