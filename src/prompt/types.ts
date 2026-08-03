import type { ResponsePlan } from "../analysis/types.js";
import type { AssistantContext } from "../context/buildContext.js";

/**
 * Seller profile shape consumed by the Prompt Engine.
 * Loaded from DB via `src/seller` — never fetched inside the Prompt Engine.
 */
export type SellerProfile = {
  id?: string;
  sellerId?: string;
  displayName?: string;
  country?: string;
  languages?: string[];
  defaultLanguage?: string;
  tone?: string;
  style?: string;
  returnPolicyText?: string;
  shippingDelayText?: string;
  refundPolicyText?: string;
  negotiationPolicyText?: string;
  negotiationAllowed?: boolean;
  signature?: string;
  customInstructions?: string;
  customRules?: string[];
};

/** Placeholder for Étape 8 — résultats RAG. */
export type SimilarConversationSnippet = {
  conversationId: string;
  summary: string;
  score?: number;
};

export type DetectedLanguage = {
  code: "fr" | "en" | "es" | "ar" | "unknown";
  label: string;
  confidence: "high" | "medium" | "low";
};

export type PromptEngineInput = {
  context: AssistantContext;
  sellerProfile?: SellerProfile;
  similarConversations?: SimilarConversationSnippet[];
  /** Precomputed response strategy (intent, length, detail). */
  responsePlan?: ResponsePlan;
  /** Max messages kept in the prompt (oldest dropped first). */
  maxMessages?: number;
  /** Max description characters in the prompt. */
  maxDescriptionChars?: number;
};

export type BuiltPrompt = {
  systemPrompt: string;
  userPrompt: string;
  language: DetectedLanguage;
  responsePlan?: ResponsePlan;
  meta: {
    conversationId: string;
    listingItemId?: string;
    messageCount: number;
    truncatedMessages: boolean;
    model: string;
  };
};

export type PromptGenerationResult = {
  prompt: BuiltPrompt;
  model: string;
  responseText: string;
  raw: unknown;
};
