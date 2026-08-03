import OpenAI from "openai";
import {
  analyzeMessage,
  enrichResponsePlanWithListing,
} from "../analysis/index.js";
import { buildAssistantContext } from "../context/buildContext.js";
import { buildPrompt, DEFAULT_PROMPT_MODEL } from "../prompt/buildPrompt.js";
import {
  searchSimilarConversations,
  toPromptSimilarSnippets,
} from "../rag/index.js";
import { loadPromptSellerProfile } from "../seller/profileService.js";
import { createAiEngine } from "./engine.js";
import type { AiEngine, AiEngineDeps, LlmCompletionResult } from "./types.js";

/**
 * Default adapters wiring existing project modules.
 * Kept outside the engine core so the engine stays infra-agnostic.
 */
export function createDefaultAiEngineDeps(
  overrides: Partial<AiEngineDeps> = {},
): AiEngineDeps {
  const completeChat: AiEngineDeps["completeChat"] = async (request) => {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
      throw new Error("Missing env var: OPENAI_API_KEY");
    }

    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: request.model,
      messages: [
        { role: "system", content: request.systemPrompt },
        { role: "user", content: request.userPrompt },
      ],
    });

    const text = completion.choices[0]?.message?.content?.trim();
    if (!text) {
      throw new Error("Réponse OpenAI vide.");
    }

    const result: LlmCompletionResult = {
      text,
      raw: completion,
      tokenUsage: {
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
      },
    };

    return result;
  };

  return {
    loadContext: (conversationId) => buildAssistantContext(conversationId),
    loadSellerProfile: (username) => loadPromptSellerProfile(username),
    analyzeMessage: ({ text, listing }) =>
      enrichResponsePlanWithListing(analyzeMessage(text), text, listing),
    searchSimilarConversations: ({ query, limit }) =>
      searchSimilarConversations({
        query,
        limit,
        ensureIndexed: true,
      }),
    toPromptSimilarSnippets,
    buildPrompt,
    completeChat,
    defaultModel: DEFAULT_PROMPT_MODEL,
    ...overrides,
  };
}

export function createDefaultAiEngine(
  overrides: Partial<AiEngineDeps> = {},
): AiEngine {
  return createAiEngine(createDefaultAiEngineDeps(overrides));
}
