import "dotenv/config";
import {
  formatSimilarConversationsSection,
  indexPendingMessageEmbeddings,
  searchSimilarConversations,
  toPromptSimilarSnippets,
} from "./rag/index.js";

async function main(): Promise<void> {
  const query = process.argv.slice(2).join(" ").trim();
  if (!query) {
    throw new Error('Usage: npm run rag -- "<question>"');
  }

  console.log("\n=== RAG — recherche de conversations similaires ===\n");
  console.log(`query=${query}\n`);

  console.log("Indexation incrémentale des embeddings manquants...");
  const indexSummary = await indexPendingMessageEmbeddings(200);
  console.log(
    `embeddings: updated=${indexSummary.embedded} pendingWas=${indexSummary.scannedNeedingUpdate} errors=${indexSummary.errors.length}`,
  );
  if (indexSummary.errors.length) {
    for (const err of indexSummary.errors) console.log(`- ${err}`);
  }
  console.log("");

  const examples = await searchSimilarConversations({
    query,
    limit: 5,
    ensureIndexed: false,
  });

  if (examples.length === 0) {
    console.log("Aucun message similaire trouvé.");
    console.log(
      "Astuce: synchronise d'abord des conversations avec `npm run sync -- <conversationId>`.",
    );
    return;
  }

  for (const [i, example] of examples.entries()) {
    console.log(`--- Résultat ${i + 1} ---`);
    console.log("Message similaire trouvé");
    console.log(`Score: ${example.score.toFixed(4)}`);
    console.log(`Conversation: ${example.ebayConversationId}`);
    console.log(`Question client: ${example.clientQuestion}`);
    console.log(
      `Réponse du vendeur: ${example.sellerReply ?? "(aucune réponse vendeur trouvée)"}`,
    );
    console.log("");
  }

  console.log("--- Section Prompt Engine (préparée, non branchée) ---");
  console.log(formatSimilarConversationsSection(examples));
  console.log("");
  console.log(
    `snippets prêts pour PromptEngine.similarConversations: ${toPromptSimilarSnippets(examples).length}`,
  );
  console.log("");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
