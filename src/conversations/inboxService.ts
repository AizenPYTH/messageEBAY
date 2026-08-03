import { getAuthenticatedUsername } from "../ebay/getUser.js";
import {
  getConversationMessages,
  listConversations,
  type EbayConversationSummary,
  type EbayMessage,
} from "../ebay/messageApi.js";
import { getListingDetails } from "../ebay/tradingApi.js";

export type InboxItem = {
  conversationId: string;
  buyer: string;
  listingTitle: string;
  lastMessagePreview: string;
  dateIso: string | undefined;
  dateLabel: string;
  unreadCount: number;
  isNew: boolean;
  /** True when the chronologically last message is from the client. */
  awaitingReply: boolean;
  /** Who sent the last message for UI clarity. */
  lastSenderSide: "client" | "seller" | "unknown";
  lastSenderUsername?: string;
  referenceId?: string;
  summary: EbayConversationSummary;
};

export function formatConversationDate(iso: string | undefined): string {
  if (!iso) return "(date inconnue)";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function previewText(text: string | undefined, max = 80): string {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return "(pas de message)";
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

function sameUser(a: string | undefined, b: string | undefined): boolean {
  return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
}

function isSellerSide(
  username: string | undefined,
  sellerUsernames: string[],
): boolean {
  return sellerUsernames.some((seller) => sameUser(username, seller));
}

function messageTime(message: EbayMessage | undefined): number {
  if (!message?.createdDate) return 0;
  const t = Date.parse(message.createdDate);
  return Number.isFinite(t) ? t : 0;
}

/** Newest message by createdDate across detail + summary.latestMessage. */
function pickLatestMessage(
  messages: EbayMessage[],
  summaryLatest?: EbayMessage,
): EbayMessage | undefined {
  const candidates = [...messages];
  if (summaryLatest) candidates.push(summaryLatest);
  if (candidates.length === 0) return undefined;

  return [...candidates].sort((a, b) => messageTime(b) - messageTime(a))[0];
}

function sortNewestFirst(
  items: EbayConversationSummary[],
): EbayConversationSummary[] {
  return [...items].sort((a, b) => {
    const ta = Date.parse(
      a.modifiedDate ?? a.latestMessage?.createdDate ?? a.createdDate ?? "",
    );
    const tb = Date.parse(
      b.modifiedDate ?? b.latestMessage?.createdDate ?? b.createdDate ?? "",
    );
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}

export function sortMessagesChronologically(
  messages: EbayMessage[],
): EbayMessage[] {
  return [...messages].sort((a, b) => messageTime(a) - messageTime(b));
}

function resolveBuyer(input: {
  authUsername?: string;
  listingSeller?: string;
  otherParty?: string;
  latestMessage?: EbayMessage;
  messages: EbayMessage[];
}): string {
  if (input.otherParty?.trim()) return input.otherParty.trim();

  const sellers = [input.authUsername, input.listingSeller].filter(
    (v): v is string => Boolean(v?.trim()),
  );

  const latest = pickLatestMessage(input.messages, input.latestMessage);
  if (latest) {
    for (const name of [latest.senderUsername, latest.recipientUsername]) {
      if (name && !isSellerSide(name, sellers)) return name;
    }
  }

  for (const message of input.messages) {
    for (const name of [message.senderUsername, message.recipientUsername]) {
      if (name && !isSellerSide(name, sellers)) return name;
    }
  }

  return "(acheteur inconnu)";
}

async function enrichInboxItem(
  summary: EbayConversationSummary,
  authUsername: string | undefined,
  listingCache: Map<string, { title: string; seller?: string }>,
): Promise<InboxItem | null> {
  const conversationId = summary.conversationId?.trim();
  if (!conversationId) return null;

  let listingTitle = "(annonce inconnue)";
  let listingSeller: string | undefined;
  const referenceId = summary.referenceId?.trim();

  if (referenceId) {
    const cached = listingCache.get(referenceId);
    if (cached) {
      listingTitle = cached.title;
      listingSeller = cached.seller;
    } else {
      const result = await getListingDetails(referenceId);
      if (result.ok) {
        listingTitle = result.listing.title?.trim() || listingTitle;
        listingSeller = result.listing.sellerUsername;
        listingCache.set(referenceId, {
          title: listingTitle,
          ...(listingSeller ? { seller: listingSeller } : {}),
        });
      }
    }
  }

  let messages: EbayMessage[] = [];
  try {
    const detail = await getConversationMessages(conversationId, "FROM_MEMBERS");
    messages = sortMessagesChronologically(detail.messages ?? []);
  } catch {
    if (summary.latestMessage) messages = [summary.latestMessage];
  }

  const sellerUsernames = [authUsername, listingSeller].filter(
    (v): v is string => Boolean(v?.trim()),
  );

  const buyer = resolveBuyer({
    authUsername,
    listingSeller,
    otherParty: summary.otherPartyUsername,
    latestMessage: summary.latestMessage,
    messages,
  });

  // Single source of truth: chronologically last message
  const lastMessage = pickLatestMessage(messages, summary.latestMessage);
  const lastSenderUsername = lastMessage?.senderUsername?.trim() || undefined;

  let lastSenderSide: InboxItem["lastSenderSide"] = "unknown";
  if (lastSenderUsername) {
    if (isSellerSide(lastSenderUsername, sellerUsernames)) {
      lastSenderSide = "seller";
    } else if (
      sameUser(lastSenderUsername, buyer) ||
      sellerUsernames.length > 0
    ) {
      // Not a known seller → treat as client
      lastSenderSide = "client";
    }
  }

  const awaitingReply = lastSenderSide === "client";
  const unreadCount = summary.unreadCount ?? 0;
  const dateIso =
    lastMessage?.createdDate ??
    summary.modifiedDate ??
    summary.createdDate;

  return {
    conversationId,
    buyer,
    listingTitle,
    lastMessagePreview: previewText(lastMessage?.messageBody),
    dateIso,
    dateLabel: formatConversationDate(dateIso),
    unreadCount,
    isNew: unreadCount > 0 || awaitingReply,
    awaitingReply,
    lastSenderSide,
    ...(lastSenderUsername ? { lastSenderUsername } : {}),
    ...(referenceId ? { referenceId } : {}),
    summary,
  };
}

/**
 * Load enriched inbox items for CLI and web UI.
 */
export async function loadInboxItems(limit = 50): Promise<InboxItem[]> {
  const [conversations, authUsername] = await Promise.all([
    listConversations("FROM_MEMBERS", limit),
    getAuthenticatedUsername(),
  ]);

  const listingCache = new Map<string, { title: string; seller?: string }>();
  const enriched = await Promise.all(
    sortNewestFirst(conversations).map((summary) =>
      enrichInboxItem(summary, authUsername, listingCache),
    ),
  );

  const items = enriched.filter((item): item is InboxItem => item !== null);

  return items.sort((a, b) => {
    if (a.awaitingReply !== b.awaitingReply) {
      return a.awaitingReply ? -1 : 1;
    }
    const ta = Date.parse(a.dateIso ?? "");
    const tb = Date.parse(b.dateIso ?? "");
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}
