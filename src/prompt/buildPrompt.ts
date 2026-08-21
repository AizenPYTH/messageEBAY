import { buildSystemPrompt } from "./systemPrompt.js";
import { detectLanguage } from "./detectLanguage.js";
import {
  formatConversationSection,
  formatInstructionsSection,
  formatLatestMessageSection,
  formatListingSection,
  formatMemorySection,
  formatPendingBuyerMessagesSection,
  formatSellerSection,
  selectMessagesForPrompt,
} from "./formatSections.js";
import type { BuiltPrompt, PromptEngineInput } from "./types.js";

/** Cheap default for eBay chat. Override with OPENAI_MODEL (e.g. gpt-5-mini). */
export const DEFAULT_PROMPT_MODEL =
  process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
const DEFAULT_MAX_MESSAGES = 8;
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

  const pending = input.pendingBuyerMessages ?? [];
  const languageSeed =
    pending.map((m) => m.messageBody).filter(Boolean).join("\n") ||
    input.context.latestMessage?.messageBody;
  const detected = detectLanguage(languageSeed);
  // Prefer plan language (already FR-defaulted); never leave "unknown".
  const language =
    input.responsePlan?.languageCode &&
    input.responsePlan.languageCode !== "unknown"
      ? {
          code: input.responsePlan.languageCode,
          label: input.responsePlan.languageLabel || detected.label,
          confidence: detected.confidence,
        }
      : detected.code === "unknown"
        ? { code: "fr" as const, label: "français", confidence: "low" as const }
        : detected;
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
    formatPendingBuyerMessagesSection(pending) ??
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
