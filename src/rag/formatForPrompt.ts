import type { SimilarConversationSnippet } from "../prompt/types.js";
import type { SimilarConversationExample } from "./types.js";

/**
 * Builds the Prompt Engine memory section payload.
 * Compatible with existing `similarConversations` hook (not wired to CLI yet).
 */
export function toPromptSimilarSnippets(
  examples: SimilarConversationExample[],
): SimilarConversationSnippet[] {
  return examples.map((example, index) => {
    const lines = [
      `Conversation ${index + 1}`,
      `ID: ${example.ebayConversationId}`,
      "",
      "Question client :",
      example.clientQuestion,
      "",
      "Réponse vendeur :",
      example.sellerReply?.trim()
        ? example.sellerReply
        : "(aucune réponse vendeur trouvée dans l'historique synchronisé)",
    ];

    return {
      conversationId: example.ebayConversationId,
      score: example.score,
      summary: lines.join("\n"),
    };
  });
}

/** Renders the dedicated RAG section for debugging / future prompt assembly. */
export function formatSimilarConversationsSection(
  examples: SimilarConversationExample[],
): string {
  if (examples.length === 0) {
    return [
      "========== CONVERSATIONS SIMILAIRES ==========",
      "(aucun exemple similaire trouvé)",
    ].join("\n");
  }

  const blocks = examples.map((example, index) =>
    [
      `Conversation ${index + 1}`,
      `Score: ${example.score.toFixed(4)}`,
      `ID: ${example.ebayConversationId}`,
      "",
      "Question client :",
      example.clientQuestion,
      "",
      "Réponse vendeur :",
      example.sellerReply?.trim()
        ? example.sellerReply
        : "(aucune réponse vendeur trouvée)",
    ].join("\n"),
  );

  return [
    "========== CONVERSATIONS SIMILAIRES ==========",
    "",
    blocks.join("\n\n"),
  ].join("\n");
}
