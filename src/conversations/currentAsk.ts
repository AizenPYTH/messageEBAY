import type { EbayMessage } from "../ebay/messageApi.js";
import {
  filterSubstantivePending,
  joinPendingBuyerText,
} from "./pendingBuyerMessages.js";

/** Consecutive buyer messages within this window = same burst (answer every point). */
const BURST_MS = 20 * 60 * 1000;

function messageTime(message: EbayMessage): number {
  if (!message.createdDate) return 0;
  const t = Date.parse(message.createdDate);
  return Number.isFinite(t) ? t : 0;
}

export type CurrentBuyerAsk = {
  /** Messages to answer now (last burst, not the whole unanswered streak). */
  messages: EbayMessage[];
  text: string;
  /** Last substantive buyer message — highest priority. */
  lastText: string;
};

/**
 * What the buyer wants NOW (messages still pending after our last reply).
 * Several buyer messages in a row → answer all of them, not only the last.
 * An unanswered question hours earlier is dropped if a new topic arrived.
 */
export function selectCurrentBuyerAsk(
  pending: EbayMessage[],
): CurrentBuyerAsk {
  const substantive = filterSubstantivePending(pending);
  if (substantive.length === 0) {
    return { messages: [], text: "", lastText: "" };
  }

  const last = substantive[substantive.length - 1]!;
  const lastT = messageTime(last) || Date.now();
  const burst: EbayMessage[] = [last];

  for (let i = substantive.length - 2; i >= 0; i -= 1) {
    const m = substantive[i]!;
    const t = messageTime(m);
    if (t && lastT - t > BURST_MS) break;
    burst.unshift(m);
  }

  const lastText = last.messageBody?.trim() ?? "";
  return {
    messages: burst,
    text: joinPendingBuyerText(burst) || lastText,
    lastText,
  };
}

export function currentAskFingerprints(
  conversationId: string,
  messages: EbayMessage[],
): string[] {
  return messages
    .map((m) => buyerMessageFingerprint(conversationId, m))
    .filter(Boolean);
}

export function buyerMessageFingerprint(
  conversationId: string,
  message: EbayMessage,
): string {
  const id = message.messageId?.trim();
  if (id) return id;
  const when = message.createdDate?.trim() || "";
  const body = (message.messageBody ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
  return `h:${conversationId}:${when}:${body.length}:${body.slice(0, 80)}`;
}
