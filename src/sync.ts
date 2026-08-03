import { isMainModule } from "./cli/isMain.js";
import { syncConversationToDatabase } from "./database/index.js";

export async function runSyncCommand(conversationId: string): Promise<void> {
  const id = conversationId.trim();
  if (!id) {
    throw new Error("conversationId is required");
  }

  console.log("\n=== Sync Supabase ===\n");
  console.log(`conversationId=${id}\n`);

  const summary = await syncConversationToDatabase(id);

  console.log(
    summary.conversationSaved
      ? "Conversation enregistrée"
      : "Conversation non enregistrée",
  );
  console.log(
    summary.listingSaved ? "Annonce enregistrée" : "Annonce non enregistrée",
  );
  console.log(`${summary.messagesSaved} messages enregistrés`);
  console.log(`${summary.errors.length} erreur${summary.errors.length > 1 ? "s" : ""}`);

  if (summary.errors.length > 0) {
    console.log("\nDétails erreurs:");
    for (const err of summary.errors) {
      console.log(`- ${err}`);
    }
    throw new Error(`Sync terminée avec ${summary.errors.length} erreur(s)`);
  }

  console.log("");
}

async function main(): Promise<void> {
  const conversationId = process.argv[2]?.trim();
  if (!conversationId) {
    throw new Error("Usage: npm run sync -- <conversationId>");
  }
  await runSyncCommand(conversationId);
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
