import { buildSystemPrompt } from "./systemPrompt.js";
import { detectLanguage } from "./detectLanguage.js";
import {
  formatConversationSection,
  formatInstructionsSection,
  formatLatestMessageSection,
  formatListingSection,
  formatMemorySection,
  formatSellerSection,
  selectMessagesForPrompt,
} from "./formatSections.js";
import type { BuiltPrompt, PromptEngineInput } from "./types.js";

export const DEFAULT_PROMPT_MODEL = "gpt-5.5";
const DEFAULT_MAX_MESSAGES = 30;
const DEFAULT_MAX_DESCRIPTION_CHARS = 2500;
const COMPACT_MAX_DESCRIPTION_CHARS = 400;

export function buildPrompt(input: PromptEngineInput): BuiltPrompt {
  const plan = input.responsePlan;
  const maxMessages = input.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const compactListing = Boolean(plan?.compactListingContext);
  const maxDescriptionChars =
    input.maxDescriptionChars ??
    (compactListing
      ? COMPACT_MAX_DESCRIPTION_CHARS
      : DEFAULT_MAX_DESCRIPTION_CHARS);

  const language = detectLanguage(input.context.latestMessage?.messageBody);
  const systemPrompt = buildSystemPrompt(language, plan);

  const { messages, truncated } = selectMessagesForPrompt(
    input.context.messages,
    maxMessages,
  );

  const listingPart = formatListingSection(
    input.context.listing,
    input.context.listingError,
    input.context.listingItemId,
    maxDescriptionChars,
    compactListing,
  );

  const sections = [
    formatSellerSection(
      input.context.listing,
      input.sellerProfile,
      language,
    ),
    listingPart.section,
    formatConversationSection(messages, truncated),
    formatLatestMessageSection(input.context.latestMessage),
    formatMemorySection(input.similarConversations),
    formatInstructionsSection(language, input.sellerProfile, plan),
  ].filter((section): section is string => Boolean(section));

  const userPrompt = sections.join("\n\n");

  return {
    systemPrompt,
    userPrompt,
    language,
    responsePlan: plan,
    meta: {
      conversationId: input.context.conversationId,
      listingItemId: input.context.listingItemId,
      messageCount: messages.length,
      truncatedMessages: truncated || listingPart.truncatedDescription,
      model: DEFAULT_PROMPT_MODEL,
    },
  };
}
