import { buildAssistantContext } from "../../context/buildContext.js";
import { getAuthenticatedUsername } from "../../ebay/getUser.js";
import {
  insertAiReply,
  upsertConversation,
  upsertListing,
  upsertMessages,
  upsertSeller,
} from "../repositories/index.js";
import type { InsertAiReplyInput } from "../types.js";

export type SyncSummary = {
  conversationSaved: boolean;
  listingSaved: boolean;
  messagesSaved: number;
  errors: string[];
};

function parsePrice(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Persist one eBay conversation (+ listing + messages) via repositories.
 * No dependency from existing CLI commands.
 */
export async function syncConversationToDatabase(
  conversationId: string,
): Promise<SyncSummary> {
  const summary: SyncSummary = {
    conversationSaved: false,
    listingSaved: false,
    messagesSaved: 0,
    errors: [],
  };

  const context = await buildAssistantContext(conversationId);
  const authUsername = await getAuthenticatedUsername();
  const listingSeller = context.listing?.sellerUsername;

  const sellerUsername = listingSeller || authUsername;
  if (!sellerUsername) {
    summary.errors.push(
      "Impossible de déterminer le username vendeur (listing/GetUser).",
    );
    return summary;
  }

  const seller = await upsertSeller({
    username: sellerUsername,
    ebayUserId: null,
  });

  let listingId: string | null = null;
  if (context.listing) {
    try {
      const listing = await upsertListing({
        itemId: context.listing.itemId,
        sellerId: seller.id,
        title: context.listing.title ?? null,
        description: context.listing.descriptionText ?? null,
        price: parsePrice(context.listing.price),
        currency: context.listing.currency ?? null,
        category: context.listing.categoryName ?? null,
        condition: context.listing.condition ?? null,
      });
      listingId = listing.id;
      summary.listingSaved = true;
    } catch (error) {
      summary.errors.push(
        error instanceof Error ? error.message : String(error),
      );
    }
  } else if (context.listingError) {
    summary.errors.push(`Annonce non synchronisée: ${context.listingError}`);
  }

  const otherParty =
    context.messages
      .map((m) => m.senderUsername)
      .find((name) => name && name !== sellerUsername) ??
    context.latestMessage?.senderUsername ??
    null;

  const conversation = await upsertConversation({
    conversationId,
    sellerId: seller.id,
    listingId,
    otherParty,
    createdAt: context.messages[0]?.createdDate ?? null,
  });
  summary.conversationSaved = true;

  const messageInputs = context.messages
    .filter((m) => m.messageId)
    .map((m) => ({
      messageId: m.messageId!,
      conversationDbId: conversation.id,
      sender: m.senderUsername ?? null,
      sentAt: m.createdDate ?? null,
      body: m.messageBody ?? null,
      isFromSeller: (m.senderUsername ?? "") === sellerUsername,
    }));

  const savedMessages = await upsertMessages(messageInputs);
  summary.messagesSaved = savedMessages.length;

  return summary;
}

/** Ready for étapes 8/10/11 — not wired to existing commands yet. */
export async function saveAiReply(
  input: InsertAiReplyInput,
): Promise<void> {
  await insertAiReply(input);
}
