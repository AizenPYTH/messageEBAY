import { config, ebayUrls } from "./config.js";

type Message = {
  messageId?: string;
  messageBody?: string;
  messageType?: string;
  senderUsername?: string;
  recipientUsername?: string;
  createdDate?: string;
  readStatus?: boolean;
};

type ConversationDetail = {
  conversationId?: string;
  conversationType?: string;
  conversationStatus?: string;
  conversationTitle?: string;
  otherPartyUsername?: string;
  messages?: Message[];
  total?: number;
  errors?: Array<{ message?: string; longMessage?: string }>;
};

async function fetchConversationMessages(
  conversationId: string,
  conversationType: "FROM_MEMBERS" | "FROM_EBAY",
): Promise<ConversationDetail> {
  if (!config.accessToken) {
    throw new Error(
      "EBAY_USER_ACCESS_TOKEN manquant. Lance d'abord : npm run auth",
    );
  }

  const url = new URL(
    `${ebayUrls.messageApi}/conversation/${encodeURIComponent(conversationId)}`,
  );
  url.searchParams.set("conversation_type", conversationType);
  url.searchParams.set("limit", "50");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  const data = (await response.json()) as ConversationDetail;

  if (!response.ok) {
    const detail =
      data.errors?.map((e) => e.longMessage ?? e.message).join("; ") ??
      JSON.stringify(data);
    throw new Error(
      `GET /conversation/${conversationId} failed: ${response.status} ${detail}`,
    );
  }

  return data;
}

function printMessages(data: ConversationDetail): void {
  const list = data.messages ?? [];
  console.log(`conversationId=${data.conversationId ?? "?"}`);
  console.log(`type=${data.conversationType ?? "?"}`);
  console.log(`status=${data.conversationStatus ?? "?"}`);
  console.log(`title=${data.conversationTitle ?? "(sans titre)"}`);
  console.log(`other=${data.otherPartyUsername ?? "?"}`);
  console.log(`messages=${list.length}\n`);

  if (list.length === 0) {
    console.log("(aucun message)");
    return;
  }

  for (const [index, m] of list.entries()) {
    console.log(`--- message ${index + 1} ---`);
    console.log(`id=${m.messageId ?? "?"}`);
    console.log(`from=${m.senderUsername ?? "?"}`);
    console.log(`to=${m.recipientUsername ?? "?"}`);
    console.log(`date=${m.createdDate ?? "?"}`);
    console.log(`read=${m.readStatus ?? "?"}`);
    console.log(`text=${m.messageBody ?? "(vide)"}`);
    console.log("");
  }
}

async function main(): Promise<void> {
  const conversationId = process.argv[2]?.trim();
  const conversationType = (
    process.argv[3]?.trim() || "FROM_MEMBERS"
  ) as "FROM_MEMBERS" | "FROM_EBAY";

  if (!conversationId) {
    throw new Error(
      "Usage: npm run messages -- <conversationId> [FROM_MEMBERS|FROM_EBAY]",
    );
  }

  console.log("\n=== eBay Message API — GET /conversation/{id} ===\n");
  console.log(`id=${conversationId} type=${conversationType}\n`);

  const data = await fetchConversationMessages(
    conversationId,
    conversationType,
  );
  printMessages(data);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
