import { buildAssistantContext } from "./context/buildContext.js";
import { isMainModule } from "./cli/isMain.js";

export async function runContextCommand(conversationId: string): Promise<void> {
  const id = conversationId.trim();
  if (!id) {
    throw new Error("conversationId is required");
  }

  console.log("\n=== Contexte assistant (étape 5) ===\n");
  console.log(`conversationId=${id}\n`);

  const ctx = await buildAssistantContext(id);

  if (ctx.listingItemId) {
    console.log(`listingItemId=${ctx.listingItemId}`);
  } else {
    console.log("listingItemId=(non disponible)");
  }

  if (ctx.listingError) {
    console.log(`listingError=${ctx.listingError}`);
  }

  console.log("\n--- promptContext ---\n");
  console.log(ctx.promptContext);
  console.log("");
}

async function main(): Promise<void> {
  const conversationId = process.argv[2]?.trim();
  if (!conversationId) {
    throw new Error("Usage: npm run context -- <conversationId>");
  }
  await runContextCommand(conversationId);
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
