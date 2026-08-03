import type {
  AiEngineDeps,
  AiEngineResult,
  AiEngineRunOptions,
} from "./types.js";

function resolveSellerUsername(
  options: AiEngineRunOptions,
  listingSellerUsername?: string,
): string | undefined {
  return options.sellerUsername?.trim() || listingSellerUsername?.trim();
}

/**
 * Pure orchestration pipeline.
 * Steps only call injected dependencies — no infra knowledge here.
 */
export async function runAiPipeline(
  deps: AiEngineDeps,
  options: AiEngineRunOptions,
): Promise<AiEngineResult> {
  const startedAt = Date.now();
  const model = options.model ?? deps.defaultModel;

  // 1–4. Context already aggregates conversation + listing details.
  const context = await deps.loadContext(options.conversationId);

  // 1. Seller profile
  const sellerUsername = resolveSellerUsername(
    options,
    context.listing?.sellerUsername,
  );
  const sellerProfile = sellerUsername
    ? await deps.loadSellerProfile(sellerUsername)
    : null;

  const latestText = context.latestMessage?.messageBody?.trim() ?? "";

  // Quality plan before GPT (intent + listing evidence for short closed questions)
  const responsePlan = deps.analyzeMessage({
    text: latestText,
    ...(context.listing ? { listing: context.listing } : {}),
  });

  // 5. RAG — similar past conversations
  const similarConversations = latestText
    ? await deps.searchSimilarConversations({
        query: latestText,
        limit: options.similarLimit ?? 5,
      })
    : [];

  const similarSnippets = deps.toPromptSimilarSnippets(similarConversations);

  // 6. Prompt Engine (with response plan)
  const built = deps.buildPrompt({
    context,
    sellerProfile: sellerProfile ?? undefined,
    similarConversations: similarSnippets,
    responsePlan,
    maxMessages: options.maxMessages,
    maxDescriptionChars: options.maxDescriptionChars,
  });

  // 7. LLM call (no eBay send)
  const completion = await deps.completeChat({
    systemPrompt: built.systemPrompt,
    userPrompt: built.userPrompt,
    model,
  });

  // 8. Structured result
  return {
    sellerProfile,
    listing: context.listing,
    listingError: context.listingError,
    conversation: {
      conversationId: context.conversationId,
      messages: context.messages,
      latestMessage: context.latestMessage,
    },
    similarConversations,
    responsePlan,
    systemPrompt: built.systemPrompt,
    userPrompt: built.userPrompt,
    model,
    reply: completion.text,
    metadata: {
      languageCode: built.language.code,
      languageLabel: built.language.label,
      listingItemId: context.listingItemId,
      messageCount: built.meta.messageCount,
      truncatedMessages: built.meta.truncatedMessages,
      similarCount: similarConversations.length,
      sellerUsername,
      intent: responsePlan.intent,
      intentLabel: responsePlan.intentLabel,
      recommendedLength: responsePlan.recommendedLength,
      detailLevel: responsePlan.detailLevel,
      maxWords: responsePlan.maxWords,
    },
    tokenUsage: completion.tokenUsage,
    latencyMs: Date.now() - startedAt,
  };
}
