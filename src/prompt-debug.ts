import { isMainModule } from "./cli/isMain.js";
import { generateEngineeredReply } from "./prompt/index.js";

export async function runPromptCommand(conversationId: string): Promise<void> {
  const id = conversationId.trim();
  if (!id) {
    throw new Error("conversationId is required");
  }

  console.log("\n=== Prompt Engine — debug ===\n");
  console.log(`conversationId=${id}\n`);

  const result = await generateEngineeredReply({ conversationId: id });

  console.log("--- META ---");
  console.log(`model=${result.model}`);
  console.log(`language=${result.prompt.language.label} (${result.prompt.language.code})`);
  console.log(`confidence=${result.prompt.language.confidence}`);
  console.log(`listingItemId=${result.prompt.meta.listingItemId ?? "(none)"}`);
  console.log(`messageCount=${result.prompt.meta.messageCount}`);
  console.log(`truncated=${result.prompt.meta.truncatedMessages}`);
  console.log("");

  console.log("--- PROMPT SYSTÈME ---");
  console.log(result.prompt.systemPrompt);
  console.log("");

  console.log("--- CONTEXTE / PROMPT UTILISATEUR ---");
  console.log(result.prompt.userPrompt);
  console.log("");

  console.log("--- RÉPONSE BRUTE DU MODÈLE ---");
  console.log(result.responseText);
  console.log("");
  console.log("(Aucun envoi eBay — commande debug uniquement)");
}

async function main(): Promise<void> {
  const conversationId = process.argv[2]?.trim();
  if (!conversationId) {
    throw new Error("Usage: npm run prompt -- <conversationId>");
  }
  await runPromptCommand(conversationId);
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
