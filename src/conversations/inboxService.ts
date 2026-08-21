import { clientNeedsReply } from "../analysis/needsReply.js";
import { getAuthenticatedUsername } from "../ebay/getUser.js";
import {
  getConversationMessages,
  listAllConversations,
  listConversations,
  type EbayConversationSummary,
  type EbayMessage,
} from "../ebay/messageApi.js";
import { collectCandidateItemIds } from "../ebay/resolveListingRef.js";
import { getListingDetails } from "../ebay/tradingApi.js";
import { getCatalogListingTitle } from "../database/repositories/listings.js";
import {
  alreadyRepliedAwaitingBuyer,
  looksLikeOurSellerReply,
  weInitiatedContact,
} from "../autopilot/alreadyReplied.js";
import {
  resolveClientUsername,
  resolveSelfUsername,
  sideOfSender,
} from "./messageSides.js";

export type InboxItem = {
  conversationId: string;
  buyer: string;
  listingTitle: string;
  lastMessagePreview: string;
  dateIso: string | undefined;
  dateLabel: string;
  unreadCount: number;
  isNew: boolean;
  /**
   * True when the client wrote last AND the message still needs a seller reply
   * (ignores thanks / goodbye / short acknowledgements).
   */
  awaitingReply: boolean;
  lastSenderSide: "client" | "seller" | "unknown";
  lastSenderUsername?: string;
  /** Seller username of the linked listing, when known. */
  listingSeller?: string;
  /** Last message is already our auto-reply — do not send again. */
  lastLooksLikeOurReply: boolean;
  /** We wrote first (we contacted another seller). */
  weInitiated: boolean;
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

async function enrichInboxItem(
  summary: EbayConversationSummary,
  authUsername: string | undefined,
  listingCache: Map<string, { title: string; seller?: string }>,
): Promise<InboxItem | null> {
  const conversationId = summary.conversationId?.trim();
  if (!conversationId) return null;

  let listingTitle =
    summary.conversationTitle?.trim() || "(annonce inconnue)";
  let listingSeller: string | undefined;
  let referenceId = summary.referenceId?.trim();

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
      } else {
        const catalogTitle = await getCatalogListingTitle(referenceId);
        if (catalogTitle) {
          listingTitle = catalogTitle;
          listingCache.set(referenceId, { title: listingTitle });
        }
      }
    }
  }

  let messages: EbayMessage[] = [];
  try {
    const detail = await getConversationMessages(conversationId, "FROM_MEMBERS");
    messages = sortMessagesChronologically(detail.messages ?? []);
    if (!listingTitle || listingTitle === "(annonce inconnue)") {
      listingTitle = detail.conversationTitle?.trim() || listingTitle;
    }
    if (!referenceId) {
      referenceId = detail.referenceId?.trim();
    }
    if (!referenceId) {
      const recovered = collectCandidateItemIds({
        conversationId,
        referenceId: detail.referenceId,
        referenceType: detail.referenceType ?? summary.referenceType,
        conversationTitle: listingTitle,
        messageBodies: messages.map((m) => m.messageBody),
      });
      referenceId = recovered[0];
    }
  } catch {
    if (summary.latestMessage) messages = [summary.latestMessage];
  }

  if (referenceId && !listingCache.has(referenceId) && listingTitle === "(annonce inconnue)") {
    const result = await getListingDetails(referenceId);
    if (result.ok) {
      listingTitle = result.listing.title?.trim() || listingTitle;
      listingSeller = result.listing.sellerUsername;
      listingCache.set(referenceId, {
        title: listingTitle,
        ...(listingSeller ? { seller: listingSeller } : {}),
      });
    } else {
      const catalogTitle = await getCatalogListingTitle(referenceId);
      if (catalogTitle) {
        listingTitle = catalogTitle;
        listingCache.set(referenceId, { title: listingTitle });
      }
    }
  } else if (referenceId && listingCache.has(referenceId)) {
    const cached = listingCache.get(referenceId)!;
    listingTitle = cached.title || listingTitle;
    listingSeller = cached.seller ?? listingSeller;
  }

  const selfUsername = resolveSelfUsername({ authUsername, listingSeller });
  const participants = messages.flatMap((m) => [
    m.senderUsername,
    m.recipientUsername,
  ]);
  if (summary.latestMessage) {
    participants.push(
      summary.latestMessage.senderUsername,
      summary.latestMessage.recipientUsername,
    );
  }

  const buyer = resolveClientUsername({
    selfUsername,
    otherPartyUsername: summary.otherPartyUsername,
    participants,
  });

  const lastMessage = pickLatestMessage(messages, summary.latestMessage);
  const lastSenderUsername = lastMessage?.senderUsername?.trim() || undefined;
  let lastSenderSide = sideOfSender({
    senderUsername: lastSenderUsername,
    selfUsername,
    clientUsername: buyer,
  });
  const selfNames = [selfUsername, authUsername];
  const lastLooksLikeOurReply =
    alreadyRepliedAwaitingBuyer({
      messages,
      selfUsernames: selfNames,
    }) || looksLikeOurSellerReply(lastMessage?.messageBody);
  if (lastLooksLikeOurReply) {
    lastSenderSide = "seller";
  }
  const weInitiated = weInitiatedContact({
    messages,
    selfUsernames: selfNames,
  });
  const awaitingReply =
    !lastLooksLikeOurReply &&
    clientNeedsReply({
      lastSenderIsClient: lastSenderSide === "client",
      lastMessageText: lastMessage?.messageBody,
    });

  // Source of truth = eBay unreadCount (not "client wrote last").
  // Fallback: count messages eBay flagged as unread (readStatus === false).
  const unreadFromSummary = Math.max(0, summary.unreadCount ?? 0);
  const unreadFromMessages = messages.filter(
    (m) => m.readStatus === false,
  ).length;
  const statusUnread =
    (summary.conversationStatus ?? "").toUpperCase() === "UNREAD" ? 1 : 0;
  const unreadCount = Math.max(
    unreadFromSummary,
    unreadFromMessages,
    statusUnread > 0 && unreadFromSummary === 0 && unreadFromMessages === 0
      ? 1
      : 0,
  );

  const dateIso =
    lastMessage?.createdDate ?? summary.modifiedDate ?? summary.createdDate;

  return {
    conversationId,
    buyer,
    listingTitle,
    lastMessagePreview: previewText(lastMessage?.messageBody),
    dateIso,
    dateLabel: formatConversationDate(dateIso),
    unreadCount,
    isNew: unreadCount > 0,
    awaitingReply,
    lastSenderSide,
    lastLooksLikeOurReply,
    weInitiated,
    ...(lastSenderUsername ? { lastSenderUsername } : {}),
    ...(listingSeller ? { listingSeller } : {}),
    ...(referenceId ? { referenceId } : {}),
    summary,
  };
}

/**
 * Load enriched inbox items for CLI and web UI.
 * For autopilot, prefer loadUnreadInboxItems (paginated UNREAD).
 */
export async function loadInboxItems(limit = 50): Promise<InboxItem[]> {
  const pageSize = Math.min(Math.max(limit, 1), 50);
  const [conversations, authUsername] = await Promise.all([
    listConversations("FROM_MEMBERS", pageSize),
    getAuthenticatedUsername(),
  ]);

  return enrichConversationList(conversations, authUsername);
}

/**
 * All unread member conversations (paginated) — for autopilot.
 * Falls back to a large active window if UNREAD filter yields nothing.
 */
export async function loadUnreadInboxItems(
  maxItems = 500,
): Promise<InboxItem[]> {
  const authUsername = await getAuthenticatedUsername();

  let conversations = await listAllConversations({
    conversationType: "FROM_MEMBERS",
    conversationStatus: "UNREAD",
    limit: 50,
    maxItems,
  });

  if (conversations.length === 0) {
    conversations = await listAllConversations({
      conversationType: "FROM_MEMBERS",
      limit: 50,
      maxItems,
    });
  }

  return enrichConversationList(conversations, authUsername);
}

async function enrichConversationList(
  conversations: EbayConversationSummary[],
  authUsername: string | undefined,
): Promise<InboxItem[]> {
  const listingCache = new Map<string, { title: string; seller?: string }>();
  const enriched = await Promise.all(
    sortNewestFirst(conversations).map((summary) =>
      enrichInboxItem(summary, authUsername, listingCache),
    ),
  );

  const items = enriched.filter((item): item is InboxItem => item !== null);

  return items.sort((a, b) => {
    const ta = Date.parse(a.dateIso ?? "");
    const tb = Date.parse(b.dateIso ?? "");
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
}
