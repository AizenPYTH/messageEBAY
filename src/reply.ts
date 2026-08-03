import { isMainModule } from "./cli/isMain.js";
import { sendConversationMessage } from "./ebay/sendMessage.js";

export async function runReplyCommand(
  conversationId: string,
  messageText: string,
): Promise<void> {
  const id = conversationId.trim();
  const text = messageText.trim();
  if (!id || !text) {
    throw new Error(
      'Usage: npm run reply -- <conversationId> "<texte du message>"',
    );
  }

  console.log("\n=== eBay Message API — POST /send_message ===\n");
  console.log(`conversationId=${id}`);
  console.log(`messageText=${text}\n`);

  const result = await sendConversationMessage(id, text);

  console.log(`HTTP ${result.status}`);
  console.log("Réponse API :");
  console.log(JSON.stringify(result.data, null, 2));
  console.log("");

  if (result.ok) {
    console.log("Message envoyé");
    if (result.data.messageId) {
      console.log(`messageId=${result.data.messageId}`);
    }
    return;
  }

  throw new Error(`Erreur: ${result.errorDetail ?? `HTTP ${result.status}`}`);
}

async function main(): Promise<void> {
  const conversationId = process.argv[2]?.trim();
  const messageText = process.argv.slice(3).join(" ").trim();
  await runReplyCommand(conversationId ?? "", messageText);
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
