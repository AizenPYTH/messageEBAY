export { embedText, indexPendingMessageEmbeddings } from "./embeddings.js";
export {
  searchSimilarMessages,
  searchSimilarConversations,
  findSellerReplyForMessage,
} from "./search.js";
export {
  formatSimilarConversationsSection,
  toPromptSimilarSnippets,
} from "./formatForPrompt.js";
export type {
  SimilarMessageHit,
  SimilarConversationExample,
  SearchSimilarOptions,
  RagIndexSummary,
  SimilarConversationSnippet,
} from "./types.js";
