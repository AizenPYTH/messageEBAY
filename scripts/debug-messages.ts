import "dotenv/config";
import {
  getConversationMessages,
  listConversations,
} from "../src/ebay/messageApi.js";
import { getAuthenticatedUsername } from "../src/ebay/getUser.js";
import { getListingDetails } from "../src/ebay/tradingApi.js";
import {
  isFromSelf,
  resolveClientUsername,
  resolveSelfUsername,
  sideOfSender,
} from "../src/conversations/messageSides.js";
import { sortMessagesChronologically } from "../src/conversations/inboxService.js";

async function main() {
  const authUsername = await getAuthenticatedUsername();
  console.log("AUTH_USER=", authUsername);

  const list = await listConversations("FROM_MEMBERS", 5);
  let failures = 0;

  for (const c of list.slice(0, 3)) {
    let listingSeller: string | undefined;
    if (c.referenceId) {
      const listing = await getListingDetails(c.referenceId);
      if (listing.ok) listingSeller = listing.listing.sellerUsername;
    }

    const detail = await getConversationMessages(
      String(c.conversationId),
      "FROM_MEMBERS",
    );
    const messages = sortMessagesChronologically(detail.messages ?? []);
    const selfUsername = resolveSelfUsername({ authUsername, listingSeller });
    const client = resolveClientUsername({
      selfUsername,
      otherPartyUsername: c.otherPartyUsername,
      participants: messages.flatMap((m) => [
        m.senderUsername,
        m.recipientUsername,
      ]),
    });

    console.log("\n====", c.conversationId);
    console.log({ authUsername, listingSeller, selfUsername, client });

    const sides = messages.map((m) => {
      const fromSelf = isFromSelf({
        senderUsername: m.senderUsername,
        selfUsername,
      });
      const side = sideOfSender({
        senderUsername: m.senderUsername,
        selfUsername,
        clientUsername: client,
      });
      return {
        sender: m.senderUsername,
        fromSelf,
        side,
        body: (m.messageBody || "").slice(0, 40),
      };
    });

    console.log(sides);

    const sellerCount = sides.filter((s) => s.fromSelf).length;
    const clientCount = sides.filter((s) => !s.fromSelf).length;
    if (messages.length >= 2 && (sellerCount === 0 || clientCount === 0)) {
      // Only fail when both parties actually appear in senders
      const uniqueSenders = new Set(messages.map((m) => m.senderUsername));
      if (uniqueSenders.size >= 2) {
        console.error("FAIL: expected both seller and client bubbles");
        failures += 1;
      }
    }
  }

  if (failures > 0) {
    process.exit(1);
  }
  console.log("\nOK — bubble sides look correct");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
