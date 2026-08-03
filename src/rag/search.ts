import {
  listMessagesForConversationDbId,
  matchMessagesByEmbedding,
} from "../database/repositories/messageEmbeddings.js";
import { embedText, indexPendingMessageEmbeddings } from "./embeddings.js";
import type {
  SearchSimilarOptions,
  SimilarConversationExample,
  SimilarMessageHit,
} from "./types.js";

function toHit(row: {
  id: string;
  message_id: string;
  conversation_id: string;
  ebay_conversation_id: string;
  sender: string | null;
  body: string | null;
  sent_at: string | null;
  similarity: number;
}): SimilarMessageHit | null {
  const body = row.body?.trim();
  if (!body) return null;
  return {
    messageDbId: row.id,
    ebayMessageId: row.message_id,
    ebayConversationId: row.ebay_conversation_id,
    conversationDbId: row.conversation_id,
    sender: row.sender,
    body,
    sentAt: row.sent_at,
    score: row.similarity,
  };
}

/**
 * Semantic nearest-neighbor search over buyer messages.
 */
export async function searchSimilarMessages(
  query: string,
  limit = 5,
  sellerId?: string | null,
): Promise<SimilarMessageHit[]> {
  const embedding = await embedText(query);
  const rows = await matchMessagesByEmbedding({
    embedding,
    matchCount: limit,
    sellerId,
  });

  return rows
    .map(toHit)
    .filter((hit): hit is SimilarMessageHit => hit !== null);
}

/**
 * From a matched buyer message, find the next seller reply in that conversation.
 */
export async function findSellerReplyForMessage(input: {
  conversationDbId: string;
  matchedMessageId: string;
  matchedSentAt: string | null;
}): Promise<string | null> {
  const messages = await listMessagesForConversationDbId(
    input.conversationDbId,
  );

  const matchedIndex = messages.findIndex(
    (m) => m.message_id === input.matchedMessageId,
  );

  const start = matchedIndex >= 0 ? matchedIndex + 1 : 0;
  for (let i = start; i < messages.length; i++) {
    const msg = messages[i]!;
    if (msg.is_from_seller && msg.body?.trim()) {
      return msg.body.trim();
    }
  }

  // Fallback: any later seller message by timestamp
  if (input.matchedSentAt) {
    const t = Date.parse(input.matchedSentAt);
    const later = messages.find(
      (m) =>
        m.is_from_seller &&
        m.body?.trim() &&
        m.sent_at &&
        Date.parse(m.sent_at) >= t,
    );
    if (later?.body) return later.body.trim();
  }

  return null;
}

/**
 * Search similar buyer questions and rebuild Q/A examples for prompting.
 */
export async function searchSimilarConversations(
  options: SearchSimilarOptions,
): Promise<SimilarConversationExample[]> {
  const limit = options.limit ?? 5;

  if (options.ensureIndexed !== false) {
    await indexPendingMessageEmbeddings(200);
  }

  // Over-fetch a bit, then dedupe by conversation.
  const hits = await searchSimilarMessages(
    options.query,
    Math.max(limit * 3, limit),
    options.sellerId,
  );

  const examples: SimilarConversationExample[] = [];
  const seenConversations = new Set<string>();

  for (const hit of hits) {
    if (seenConversations.has(hit.ebayConversationId)) continue;
    seenConversations.add(hit.ebayConversationId);

    const sellerReply = await findSellerReplyForMessage({
      conversationDbId: hit.conversationDbId,
      matchedMessageId: hit.ebayMessageId,
      matchedSentAt: hit.sentAt,
    });

    examples.push({
      ebayConversationId: hit.ebayConversationId,
      score: hit.score,
      clientQuestion: hit.body,
      sellerReply,
      matchedMessageId: hit.ebayMessageId,
      matchedSender: hit.sender,
    });

    if (examples.length >= limit) break;
  }

  return examples;
}
