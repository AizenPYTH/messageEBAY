import { config, ebayUrls } from "./config.js";

type Conversation = {
  conversationId?: string;
  conversationType?: string;
  conversationStatus?: string;
  conversationTitle?: string;
  createdDate?: string;
  modifiedDate?: string;
  messageCount?: number;
  unreadCount?: number;
  otherPartyUsername?: string;
};

type ConversationsResponse = {
  href?: string;
  limit?: number;
  offset?: number;
  total?: number;
  conversations?: Conversation[];
  errors?: Array<{ message?: string; longMessage?: string }>;
};

async function fetchConversations(
  conversationType: "FROM_MEMBERS" | "FROM_EBAY",
): Promise<ConversationsResponse> {
  if (!config.accessToken) {
    throw new Error(
      "EBAY_USER_ACCESS_TOKEN manquant. Lance d'abord : npm run auth",
    );
  }

  const url = new URL(`${ebayUrls.messageApi}/conversation`);
  url.searchParams.set("conversation_type", conversationType);
  url.searchParams.set("limit", "50");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  const data = (await response.json()) as ConversationsResponse;

  if (!response.ok) {
    const detail =
      data.errors?.map((e) => e.longMessage ?? e.message).join("; ") ??
      JSON.stringify(data);
    throw new Error(
      `GET /conversation (${conversationType}) failed: ${response.status} ${detail}`,
    );
  }

  return data;
}

function printConversations(
  type: string,
  data: ConversationsResponse,
): void {
  const list = data.conversations ?? [];
  console.log(`\n--- ${type} (total: ${data.total ?? list.length}) ---`);

  if (list.length === 0) {
    console.log("(aucune conversation)");
    return;
  }

  for (const c of list) {
    console.log(
      [
        `id=${c.conversationId ?? "?"}`,
        `status=${c.conversationStatus ?? "?"}`,
        `title=${c.conversationTitle ?? "(sans titre)"}`,
        `other=${c.otherPartyUsername ?? "?"}`,
        `unread=${c.unreadCount ?? 0}`,
        `messages=${c.messageCount ?? "?"}`,
        `modified=${c.modifiedDate ?? "?"}`,
      ].join(" | "),
    );
  }
}

async function main(): Promise<void> {
  console.log("\n=== eBay Message API — GET /conversation ===\n");

  const fromMembers = await fetchConversations("FROM_MEMBERS");
  printConversations("FROM_MEMBERS", fromMembers);

  const fromEbay = await fetchConversations("FROM_EBAY");
  printConversations("FROM_EBAY", fromEbay);

  console.log("");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
