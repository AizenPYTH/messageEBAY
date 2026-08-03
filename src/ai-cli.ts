import "dotenv/config";
import { createDefaultAiEngine } from "./ai/index.js";
import { isMainModule } from "./cli/isMain.js";

export async function runAiCommand(conversationId: string): Promise<void> {
  const id = conversationId.trim();
  if (!id) {
    throw new Error("conversationId is required");
  }

  console.log("\n=== AI Engine — orchestration ===\n");
  console.log(`conversationId=${id}`);
  console.log("(Aucun envoi eBay)\n");

  const engine = createDefaultAiEngine();
  const result = await engine.run({ conversationId: id });

  console.log("--- Analyse ---");
  console.log(`Type de question : ${result.metadata.intentLabel} (${result.metadata.intent})`);
  console.log(`Langue : ${result.metadata.languageLabel} (${result.metadata.languageCode})`);
  console.log(
    `Longueur recommandée : ${result.metadata.recommendedLength} (~${result.metadata.maxWords} mots, détail=${result.metadata.detailLevel})`,
  );
  if (result.responsePlan.closedQuestionTopic) {
    console.log(`Sujet fermé : ${result.responsePlan.closedQuestionTopic}`);
  }
  if (result.responsePlan.listingAnswerability) {
    console.log(
      `Couverture annonce : ${result.responsePlan.listingAnswerability}`,
    );
  }
  if (result.responsePlan.suggestedDirectReply) {
    console.log(`Réponse cible : ${result.responsePlan.suggestedDirectReply}`);
  }
  console.log(`Nombre de messages dans le contexte : ${result.metadata.messageCount}`);
  console.log(
    `Nombre de conversations RAG utilisées : ${result.metadata.similarCount}`,
  );
  if (result.responsePlan.reasons.length) {
    console.log(`Raisons : ${result.responsePlan.reasons.join("; ")}`);
  }
  console.log("");

  console.log(
    result.sellerProfile
      ? `Profil vendeur chargé (${result.sellerProfile.displayName ?? result.metadata.sellerUsername ?? "?"})`
      : "Profil vendeur non trouvé",
  );
  console.log(
    result.listing
      ? `Annonce chargée (${result.listing.itemId})`
      : `Annonce non chargée${result.listingError ? `: ${result.listingError}` : ""}`,
  );
  console.log(
    `Conversation chargée (${result.conversation.messages.length} messages)`,
  );
  console.log(
    `Conversations similaires trouvées (${result.similarConversations.length})`,
  );
  console.log("Prompt construit");
  console.log(`Réponse GPT générée (model=${result.model})`);
  console.log(`Temps total: ${result.latencyMs} ms`);

  if (result.tokenUsage?.totalTokens !== undefined) {
    console.log(
      `Tokens: prompt=${result.tokenUsage.promptTokens ?? "?"} completion=${result.tokenUsage.completionTokens ?? "?"} total=${result.tokenUsage.totalTokens}`,
    );
  }

  console.log("\n--- Réponse ---");
  console.log(result.reply);
  console.log("");
}

async function main(): Promise<void> {
  const conversationId = process.argv[2]?.trim();
  if (!conversationId) {
    throw new Error("Usage: npm run ai -- <conversationId>");
  }
  await runAiCommand(conversationId);
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
