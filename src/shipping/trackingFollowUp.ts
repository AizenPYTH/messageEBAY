import { isFromSelf } from "../conversations/messageSides.js";
import type { EbayMessage } from "../ebay/messageApi.js";
import { isTrackingRequest } from "./detectTracking.js";

/**
 * True when the buyer already asked about tracking earlier in the thread
 * (current latest message excluded).
 */
export function isTrackingFollowUp(input: {
  messages: EbayMessage[];
  sellerUsername?: string;
}): boolean {
  const messages = input.messages;
  if (messages.length < 2) return false;

  const prior = messages.slice(0, -1);
  for (const message of prior) {
    if (
      isFromSelf({
        senderUsername: message.senderUsername,
        selfUsername: input.sellerUsername,
      })
    ) {
      continue;
    }
    if (isTrackingRequest(message.messageBody)) {
      return true;
    }
  }
  return false;
}
