import { config, ebayUrls } from "../config.js";

export type EbayMessage = {
  messageId?: string;
  messageBody?: string;
  senderUsername?: string;
  recipientUsername?: string;
  createdDate?: string;
  readStatus?: boolean;
};

export type EbayConversationSummary = {
  conversationId?: string;
  conversationStatus?: string;
  conversationType?: string;
  conversationTitle?: string;
  createdDate?: string;
  modifiedDate?: string;
  referenceId?: string;
  referenceType?: string;
  unreadCount?: number;
  messageCount?: number;
  otherPartyUsername?: string;
  latestMessage?: EbayMessage;
};

export type EbayConversationDetail = {
  conversationId?: string;
  conversationType?: string;
  conversationStatus?: string;
  conversationTitle?: string;
  messages?: EbayMessage[];
  total?: number;
  errors?: Array<{ message?: string; longMessage?: string }>;
};

function authHeaders(): HeadersInit {
  if (!config.accessToken) {
    throw new Error(
      "EBAY_USER_ACCESS_TOKEN manquant. Lance d'abord : npm run auth",
    );
  }

  return {
    Authorization: `Bearer ${config.accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export async function listConversations(
  conversationType: "FROM_MEMBERS" | "FROM_EBAY" = "FROM_MEMBERS",
  limit = 50,
): Promise<EbayConversationSummary[]> {
  const url = new URL(`${ebayUrls.messageApi}/conversation`);
  url.searchParams.set("conversation_type", conversationType);
  url.searchParams.set("limit", String(limit));

  const response = await fetch(url, { headers: authHeaders() });
  const data = (await response.json()) as {
    conversations?: EbayConversationSummary[];
    errors?: Array<{ message?: string; longMessage?: string }>;
  };

  if (!response.ok) {
    const detail =
      data.errors?.map((e) => e.longMessage ?? e.message).join("; ") ??
      JSON.stringify(data);
    throw new Error(
      `GET /conversation (${conversationType}) failed: ${response.status} ${detail}`,
    );
  }

  return data.conversations ?? [];
}

export async function getConversationMessages(
  conversationId: string,
  conversationType: "FROM_MEMBERS" | "FROM_EBAY" = "FROM_MEMBERS",
): Promise<EbayConversationDetail> {
  const url = new URL(
    `${ebayUrls.messageApi}/conversation/${encodeURIComponent(conversationId)}`,
  );
  url.searchParams.set("conversation_type", conversationType);
  url.searchParams.set("limit", "50");

  const response = await fetch(url, { headers: authHeaders() });
  const data = (await response.json()) as EbayConversationDetail;

  if (!response.ok) {
    const detail =
      data.errors?.map((e) => e.longMessage ?? e.message).join("; ") ??
      JSON.stringify(data);
    throw new Error(
      `GET /conversation/${conversationId} failed: ${response.status} ${detail}`,
    );
  }

  return {
    ...data,
    conversationId: data.conversationId ?? conversationId,
    conversationType: data.conversationType ?? conversationType,
  };
}

export async function findConversationSummary(
  conversationId: string,
): Promise<EbayConversationSummary | undefined> {
  const conversations = await listConversations("FROM_MEMBERS", 50);
  return conversations.find((c) => c.conversationId === conversationId);
}
