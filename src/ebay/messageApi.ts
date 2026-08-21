import { config, ebayUrls } from "../config.js";
import { stripHtml } from "./xml.js";

export type EbayMessage = {
  messageId?: string;
  messageBody?: string;
  senderUsername?: string;
  recipientUsername?: string;
  createdDate?: string;
  /** false = unread on eBay */
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
  /** Unread messages according to eBay Message API */
  unreadCount?: number;
  messageCount?: number;
  otherPartyUsername?: string;
  latestMessage?: EbayMessage;
};

type EbayMessageRaw = Record<string, unknown>;

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  return undefined;
}

function cleanMessageBody(raw: unknown): string | undefined {
  const text = asString(raw);
  if (!text) return undefined;
  // eBay sometimes returns HTML / entities that look broken in the chat UI.
  if (/<[^>]+>|&(?:nbsp|amp|lt|gt|quot|#\d+);/i.test(text)) {
    return stripHtml(text) || undefined;
  }
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim() || undefined;
}

function normalizeMessage(raw: EbayMessageRaw | undefined): EbayMessage | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  return {
    messageId: asString(raw.messageId ?? raw.message_id),
    messageBody: cleanMessageBody(raw.messageBody ?? raw.message_body),
    senderUsername: asString(raw.senderUsername ?? raw.sender_username),
    recipientUsername: asString(
      raw.recipientUsername ?? raw.recipient_username,
    ),
    createdDate: asString(raw.createdDate ?? raw.created_date),
    readStatus: asBoolean(raw.readStatus ?? raw.read_status),
  };
}

/** Normalize eBay conversation payload (camelCase or snake_case). */
export function normalizeConversationSummary(
  raw: EbayMessageRaw,
): EbayConversationSummary {
  const latestRaw = (raw.latestMessage ?? raw.latest_message) as
    | EbayMessageRaw
    | undefined;
  return {
    conversationId: asString(raw.conversationId ?? raw.conversation_id),
    conversationStatus: asString(
      raw.conversationStatus ?? raw.conversation_status,
    ),
    conversationType: asString(raw.conversationType ?? raw.conversation_type),
    conversationTitle: asString(
      raw.conversationTitle ?? raw.conversation_title,
    ),
    createdDate: asString(raw.createdDate ?? raw.created_date),
    modifiedDate: asString(raw.modifiedDate ?? raw.modified_date),
    referenceId: pickReferenceId(raw),
    referenceType: asString(raw.referenceType ?? raw.reference_type),
    unreadCount: asNumber(raw.unreadCount ?? raw.unread_count) ?? 0,
    messageCount: asNumber(raw.messageCount ?? raw.message_count),
    otherPartyUsername: asString(
      raw.otherPartyUsername ?? raw.other_party_username,
    ),
    latestMessage: normalizeMessage(latestRaw),
  };
}

export type EbayConversationDetail = {
  conversationId?: string;
  conversationType?: string;
  conversationStatus?: string;
  conversationTitle?: string;
  referenceId?: string;
  referenceType?: string;
  messages?: EbayMessage[];
  total?: number;
  errors?: Array<{ message?: string; longMessage?: string }>;
};

function pickReferenceId(raw: EbayMessageRaw): string | undefined {
  return asString(
    raw.referenceId ??
      raw.reference_id ??
      raw.itemId ??
      raw.item_id ??
      raw.listingId ??
      raw.listing_id,
  );
}

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

export type ListConversationsOptions = {
  conversationType?: "FROM_MEMBERS" | "FROM_EBAY";
  /** Page size (eBay typically allows ~25–50). */
  limit?: number;
  offset?: number;
  /** eBay filter: UNREAD | READ | ACTIVE | … */
  conversationStatus?: string;
};

export async function listConversations(
  conversationType: "FROM_MEMBERS" | "FROM_EBAY" = "FROM_MEMBERS",
  limit = 50,
  options?: Omit<ListConversationsOptions, "conversationType" | "limit">,
): Promise<EbayConversationSummary[]> {
  const url = new URL(`${ebayUrls.messageApi}/conversation`);
  url.searchParams.set("conversation_type", conversationType);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 1), 50)));
  if (typeof options?.offset === "number" && options.offset > 0) {
    url.searchParams.set("offset", String(options.offset));
  }
  if (options?.conversationStatus?.trim()) {
    url.searchParams.set(
      "conversation_status",
      options.conversationStatus.trim().toUpperCase(),
    );
  }

  const response = await fetch(url, { headers: authHeaders() });
  const data = (await response.json()) as {
    conversations?: EbayMessageRaw[];
    total?: number;
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

  return (data.conversations ?? []).map((raw) =>
    normalizeConversationSummary(raw),
  );
}

/**
 * Paginate eBay conversations until exhausted or maxItems reached.
 * Prefer UNREAD when asking for open buyer questions.
 */
export async function listAllConversations(
  options?: ListConversationsOptions & { maxItems?: number },
): Promise<EbayConversationSummary[]> {
  const conversationType = options?.conversationType ?? "FROM_MEMBERS";
  const pageSize = Math.min(Math.max(options?.limit ?? 50, 1), 50);
  const maxItems = options?.maxItems ?? 500;
  const out: EbayConversationSummary[] = [];
  const seen = new Set<string>();
  let offset = options?.offset ?? 0;
  let statusFilter = options?.conversationStatus;

  while (out.length < maxItems) {
    let page: EbayConversationSummary[];
    try {
      page = await listConversations(conversationType, pageSize, {
        offset,
        conversationStatus: statusFilter,
      });
    } catch (error) {
      // Older accounts / API quirks: UNREAD filter may 400 — fall back without it.
      if (statusFilter && offset === 0) {
        statusFilter = undefined;
        page = await listConversations(conversationType, pageSize, { offset });
      } else {
        throw error;
      }
    }

    if (page.length === 0) break;

    for (const c of page) {
      const id = c.conversationId?.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(c);
      if (out.length >= maxItems) break;
    }

    if (page.length < pageSize) break;
    offset += page.length;
    // Safety: avoid infinite loops if eBay ignores offset.
    if (offset > 5000) break;
  }

  return out;
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
  const data = (await response.json()) as EbayMessageRaw & {
    messages?: EbayMessageRaw[];
    errors?: Array<{ message?: string; longMessage?: string }>;
    total?: number;
  };

  if (!response.ok) {
    const detail =
      data.errors?.map((e) => e.longMessage ?? e.message).join("; ") ??
      JSON.stringify(data);
    throw new Error(
      `GET /conversation/${conversationId} failed: ${response.status} ${detail}`,
    );
  }

  const messages = (data.messages ?? [])
    .map((m) => normalizeMessage(m))
    .filter((m): m is EbayMessage => Boolean(m));

  return {
    conversationId:
      asString(data.conversationId ?? data.conversation_id) ?? conversationId,
    conversationType:
      asString(data.conversationType ?? data.conversation_type) ??
      conversationType,
    conversationStatus: asString(
      data.conversationStatus ?? data.conversation_status,
    ),
    conversationTitle: asString(
      data.conversationTitle ?? data.conversation_title,
    ),
    referenceId: pickReferenceId(data) ?? (data.messages ?? []).map(pickReferenceId).find(Boolean),
    referenceType: asString(data.referenceType ?? data.reference_type),
    messages,
    total: asNumber(data.total) ?? messages.length,
    errors: data.errors,
  };
}

export async function findConversationSummary(
  conversationId: string,
): Promise<EbayConversationSummary | undefined> {
  const pageSize = 50;
  let offset = 0;
  while (offset < 500) {
    const page = await listConversations("FROM_MEMBERS", pageSize, { offset });
    const hit = page.find((c) => c.conversationId === conversationId);
    if (hit) return hit;
    if (page.length < pageSize) break;
    offset += page.length;
  }
  return undefined;
}
