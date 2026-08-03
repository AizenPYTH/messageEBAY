import type { SimilarConversationSnippet } from "../prompt/types.js";

export type SimilarMessageHit = {
  messageDbId: string;
  ebayMessageId: string;
  ebayConversationId: string;
  conversationDbId: string;
  sender: string | null;
  body: string;
  sentAt: string | null;
  /** Cosine similarity in [0, 1] (approx). */
  score: number;
};

export type SimilarConversationExample = {
  ebayConversationId: string;
  score: number;
  clientQuestion: string;
  sellerReply: string | null;
  matchedMessageId: string;
  matchedSender: string | null;
};

export type SearchSimilarOptions = {
  query: string;
  limit?: number;
  sellerId?: string | null;
  /** If true, index missing embeddings before searching. Default true. */
  ensureIndexed?: boolean;
};

export type RagIndexSummary = {
  scannedNeedingUpdate: number;
  embedded: number;
  skipped: number;
  errors: string[];
};

export type { SimilarConversationSnippet };
