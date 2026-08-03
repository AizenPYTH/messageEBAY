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
  /** Last message is from the buyer — seller has not replied yet. */
  awaitingReply: boolean;
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
  return [...messages].sort((a, b) => {
    const ta = a.createdDate ? Date.parse(a.createdDate) : 0;
    const tb = b.createdDate ? Date.parse(b.createdDate) : 0;
    return ta - tb;
  });
}

function resolveOtherParty(input: {
  authUsername?: string;
  listingSeller?: string;
  latestMessage?: EbayMessage;
  messages: EbayMessage[];
}): string | undefined {
  const { authUsername, listingSeller, latestMessage, messages } = input;
  const me = authUsername ?? listingSeller;

  if (latestMessage) {
    const { senderUsername, recipientUsername } = latestMessage;
    if (me && senderUsername && !sameUser(senderUsername, me)) {
      return senderUsername;
    }
    if (me && recipientUsername && !sameUser(recipientUsername, me)) {
      return recipientUsername;
    }
  }

  for (const message of messages) {
    for (const name of [message.senderUsername, message.recipientUsername]) {
      if (name && me && !sameUser(name, me)) return name;
      if (name && listingSeller && !sameUser(name, listingSeller)) return name;
    }
  }

  return undefined;
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

  const buyer =
    summary.otherPartyUsername?.trim() ||
    resolveOtherParty({
      authUsername,
      listingSeller,
      latestMessage: summary.latestMessage,
      messages,
    }) ||
    "(acheteur inconnu)";

  const buyerMessages = messages.filter((m) =>
    sameUser(m.senderUsername, buyer),
  );
  const previewMessage =
    buyerMessages[buyerMessages.length - 1] ??
    messages[messages.length - 1] ??
    summary.latestMessage;

  const dateIso =
    previewMessage?.createdDate ??
    summary.modifiedDate ??
    summary.latestMessage?.createdDate ??
    summary.createdDate;

  const unreadCount = summary.unreadCount ?? 0;
  const lastMessage = messages[messages.length - 1] ?? summary.latestMessage;
  const me = authUsername ?? listingSeller;
  const lastFromBuyer = Boolean(
    lastMessage?.senderUsername &&
      (sameUser(lastMessage.senderUsername, buyer) ||
        (me && !sameUser(lastMessage.senderUsername, me))),
  );
  // Priority: client wrote last (you have not replied yet)
  const awaitingReply = lastFromBuyer || (unreadCount > 0 && !me);

  return {
    conversationId,
    buyer,
    listingTitle,
    lastMessagePreview: previewText(previewMessage?.messageBody),
    dateIso,
    dateLabel: formatConversationDate(dateIso),
    unreadCount,
    isNew: unreadCount > 0 || awaitingReply,
    awaitingReply,
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

  // À répondre first, then already-replied — each group newest first
  return items.sort((a, b) => {
    if (a.awaitingReply !== b.awaitingReply) {
      return a.awaitingReply ? -1 : 1;
    }
    const ta = Date.parse(a.dateIso ?? "");
    const tb = Date.parse(b.dateIso ?? "");
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}
