import type { ResponsePlan } from "../analysis/types.js";
import type { AssistantContext } from "../context/buildContext.js";
import type { ListingDetails } from "../ebay/tradingApi.js";
import type { EbayMessage } from "../ebay/messageApi.js";
import type {
  BuiltPrompt,
  PromptEngineInput,
  SellerProfile,
  SimilarConversationSnippet,
} from "../prompt/types.js";
import type { SimilarConversationExample } from "../rag/types.js";

export type TokenUsage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};

export type LlmCompletionRequest = {
  systemPrompt: string;
  userPrompt: string;
  model: string;
};

export type LlmCompletionResult = {
  text: string;
  raw: unknown;
  tokenUsage?: TokenUsage;
};

/**
 * Injected ports — the engine never imports Supabase / SQL / eBay clients.
 */
export type AiEngineDeps = {
  loadContext: (conversationId: string) => Promise<AssistantContext>;
  loadSellerProfile: (username: string) => Promise<SellerProfile | null>;
  analyzeMessage: (input: {
    text: string | undefined;
    listing?: ListingDetails;
  }) => ResponsePlan;
  searchSimilarConversations: (input: {
    query: string;
    limit: number;
  }) => Promise<SimilarConversationExample[]>;
  toPromptSimilarSnippets: (
    examples: SimilarConversationExample[],
  ) => SimilarConversationSnippet[];
  buildPrompt: (input: PromptEngineInput) => BuiltPrompt;
  completeChat: (request: LlmCompletionRequest) => Promise<LlmCompletionResult>;
  defaultModel: string;
};

export type AiEngineRunOptions = {
  conversationId: string;
  /** Override seller username (otherwise taken from listing). */
  sellerUsername?: string;
  similarLimit?: number;
  model?: string;
  maxMessages?: number;
  maxDescriptionChars?: number;
};

export type AiEngineResult = {
  sellerProfile: SellerProfile | null;
  listing: ListingDetails | undefined;
  listingError?: string;
  conversation: {
    conversationId: string;
    messages: EbayMessage[];
    latestMessage?: EbayMessage;
  };
  similarConversations: SimilarConversationExample[];
  responsePlan: ResponsePlan;
  systemPrompt: string;
  userPrompt: string;
  model: string;
  reply: string;
  metadata: {
    languageCode: string;
    languageLabel: string;
    listingItemId?: string;
    messageCount: number;
    truncatedMessages: boolean;
    similarCount: number;
    sellerUsername?: string;
    intent: string;
    intentLabel: string;
    recommendedLength: string;
    detailLevel: string;
    maxWords: number;
  };
  tokenUsage?: TokenUsage;
  latencyMs: number;
};

export type AiEngine = {
  run: (options: AiEngineRunOptions) => Promise<AiEngineResult>;
};
