import OpenAI from "openai";
import {
  analyzeMessage,
  enrichResponsePlanWithListing,
} from "../analysis/index.js";
import { buildAssistantContext } from "../context/buildContext.js";
import { loadPromptSellerProfile } from "../seller/profileService.js";
import { buildPrompt, DEFAULT_PROMPT_MODEL } from "./buildPrompt.js";
import type {
  PromptEngineInput,
  PromptGenerationResult,
  SellerProfile,
  SimilarConversationSnippet,
} from "./types.js";

export type GenerateReplyOptions = {
  conversationId: string;
  sellerProfile?: SellerProfile;
  /** Username used to auto-load seller_profiles when sellerProfile is omitted. */
  sellerUsername?: string;
  similarConversations?: SimilarConversationSnippet[];
  maxMessages?: number;
  maxDescriptionChars?: number;
  model?: string;
};

/**
 * Builds context + prompt, optionally auto-loading SellerProfile from DB.
 * suggest/autoreply remain unwired; this prepares the Prompt Engine path only.
 */
export async function generateEngineeredReply(
  options: GenerateReplyOptions,
): Promise<PromptGenerationResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing env var: OPENAI_API_KEY");
  }

  const context = await buildAssistantContext(options.conversationId);

  let sellerProfile = options.sellerProfile;
  if (!sellerProfile) {
    const username =
      options.sellerUsername?.trim() ||
      context.listing?.sellerUsername?.trim();
    if (username) {
      sellerProfile = (await loadPromptSellerProfile(username)) ?? undefined;
    }
  }

  const responsePlan = enrichResponsePlanWithListing(
    analyzeMessage(context.latestMessage?.messageBody),
    context.latestMessage?.messageBody,
    context.listing,
  );

  const input: PromptEngineInput = {
    context,
    sellerProfile,
    similarConversations: options.similarConversations,
    responsePlan,
    maxMessages: options.maxMessages,
    maxDescriptionChars: options.maxDescriptionChars,
  };

  const prompt = buildPrompt(input);
  const model = options.model ?? DEFAULT_PROMPT_MODEL;

  const client = new OpenAI({ apiKey });
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: prompt.systemPrompt },
      { role: "user", content: prompt.userPrompt },
    ],
  });

  const responseText = completion.choices[0]?.message?.content?.trim();
  if (!responseText) {
    throw new Error("Réponse OpenAI vide.");
  }

  return {
    prompt: {
      ...prompt,
      meta: { ...prompt.meta, model },
    },
    model,
    responseText,
    raw: completion,
  };
}
