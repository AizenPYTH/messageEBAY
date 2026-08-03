import "dotenv/config";
import { createInterface, type Interface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { runAiCommand } from "./ai-cli.js";
import { runAutoreplyCommand } from "./autoreply.js";
import { isMainModule } from "./cli/isMain.js";
import {
  formatConversationDate,
  loadInboxItems,
  sortMessagesChronologically,
  type InboxItem,
} from "./conversations/index.js";
import { runContextCommand } from "./context.js";
import { buildAssistantContext } from "./context/buildContext.js";
import { runPromptCommand } from "./prompt-debug.js";
import { runSyncCommand } from "./sync.js";

function printInboxList(items: InboxItem[]): void {
  console.log("\n========================");
  console.log("Boîte de réception eBay");
  console.log("========================\n");

  if (items.length === 0) {
    console.log("(aucune conversation FROM_MEMBERS)");
    return;
  }

  for (const [index, item] of items.entries()) {
    console.log(`[${index + 1}] ${item.buyer}${item.isNew ? " · Nouveau" : ""}`);
    console.log(`Annonce : ${item.listingTitle}`);
    console.log(`Dernier message : ${item.lastMessagePreview}`);
    console.log(`Date : ${item.dateLabel}`);
    console.log("");
  }
}

async function printConversationDetail(item: InboxItem): Promise<void> {
  console.log("\n----------------------");
  console.log("Conversation");
  console.log("----------------------\n");

  console.log(`Acheteur : ${item.buyer}`);
  console.log(`conversationId : ${item.conversationId}`);
  console.log("");

  console.log("Chargement du détail…");
  const ctx = await buildAssistantContext(item.conversationId);

  const title = ctx.listing?.title ?? item.listingTitle;
  console.log("\n--- Annonce ---");
  console.log(`Titre : ${title}`);
  if (ctx.listing) {
    console.log(
      `Prix : ${ctx.listing.price ?? "?"} ${ctx.listing.currency ?? ""}`.trim(),
    );
    console.log(`État : ${ctx.listing.condition ?? "(non disponible)"}`);
    console.log(`Statut : ${ctx.listing.listingStatus ?? "(non disponible)"}`);
    console.log(`Stock : ${ctx.listing.quantity ?? "(non disponible)"}`);
    if (ctx.listingItemId) {
      console.log(`ItemID : ${ctx.listingItemId}`);
    }
  } else {
    console.log(
      `Détail annonce : (non disponible)${ctx.listingError ? ` — ${ctx.listingError}` : ""}`,
    );
  }

  const messages = sortMessagesChronologically(ctx.messages);
  console.log("\n--- Messages ---");
  if (messages.length === 0) {
    console.log("(aucun message)");
  } else {
    for (const [index, message] of messages.entries()) {
      console.log("");
      console.log(
        `[${index + 1}] ${message.senderUsername ?? "?"} — ${formatConversationDate(message.createdDate)}`,
      );
      console.log(message.messageBody?.trim() || "(vide)");
    }
  }

  const latest = ctx.latestMessage;
  console.log("\n--- Dernier message ---");
  if (latest?.messageBody?.trim()) {
    console.log(`De : ${latest.senderUsername ?? "?"}`);
    console.log(`Date : ${formatConversationDate(latest.createdDate)}`);
    console.log(latest.messageBody.trim());
  } else {
    console.log("(aucun)");
  }

  console.log(`\n(debug) conversationId=${item.conversationId}`);
}

function printActionsMenu(): void {
  console.log("\n======================");
  console.log("Actions");
  console.log("======================\n");
  console.log("1 - Générer une réponse IA");
  console.log("2 - Répondre avec validation");
  console.log("3 - Afficher le contexte complet");
  console.log("4 - Afficher le Prompt Engine");
  console.log("5 - Synchroniser avec Supabase");
  console.log("6 - Conversation suivante");
  console.log("7 - Conversation précédente");
  console.log("8 - Retour à la liste");
  console.log("0 - Quitter");
  console.log("");
}

async function ask(rl: Interface, prompt: string): Promise<string> {
  return (await rl.question(prompt)).trim();
}

async function pause(rl: Interface): Promise<void> {
  await ask(rl, "\nAppuyez sur Entrée pour continuer…");
}

async function runSafe(
  rl: Interface,
  label: string,
  action: () => Promise<void>,
): Promise<void> {
  console.log(`\n› ${label}\n`);
  try {
    await action();
  } catch (error: unknown) {
    console.error(
      `\nErreur : ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  await pause(rl);
}

async function conversationLoop(
  rl: Interface,
  items: InboxItem[],
  startIndex: number,
): Promise<"list" | "quit"> {
  let index = startIndex;

  while (true) {
    const item = items[index];
    if (!item) return "list";

    await printConversationDetail(item);
    printActionsMenu();

    const choice = await ask(rl, "Action :\n> ");

    switch (choice) {
      case "1":
        await runSafe(rl, "Génération IA", () =>
          runAiCommand(item.conversationId),
        );
        break;
      case "2":
        await runSafe(rl, "Autoreply avec validation", () =>
          runAutoreplyCommand(item.conversationId, {
            confirmSend: async () => {
              const answer = (
                await ask(rl, "Envoyer cette réponse sur eBay ? (y/N) ")
              ).toLowerCase();
              return answer === "y" || answer === "yes";
            },
          }),
        );
        break;
      case "3":
        await runSafe(rl, "Contexte complet", () =>
          runContextCommand(item.conversationId),
        );
        break;
      case "4":
        await runSafe(rl, "Prompt Engine", () =>
          runPromptCommand(item.conversationId),
        );
        break;
      case "5":
        await runSafe(rl, "Sync Supabase", () =>
          runSyncCommand(item.conversationId),
        );
        break;
      case "6":
        if (index >= items.length - 1) {
          console.log("\nDéjà sur la dernière conversation.");
          await pause(rl);
        } else {
          index += 1;
        }
        break;
      case "7":
        if (index <= 0) {
          console.log("\nDéjà sur la première conversation.");
          await pause(rl);
        } else {
          index -= 1;
        }
        break;
      case "8":
        return "list";
      case "0":
      case "q":
      case "quit":
        return "quit";
      default:
        console.log("\nChoix invalide. Entrez un numéro du menu.");
        await pause(rl);
        break;
    }
  }
}

async function main(): Promise<void> {
  const rl = createInterface({ input, output });

  try {
    console.log("\nChargement de la boîte de réception…");
    let items = await loadInboxItems();

    while (true) {
      printInboxList(items);

      if (items.length === 0) {
        const again = await ask(
          rl,
          "Aucune conversation. Actualiser ? (y/N)\n> ",
        );
        if (again.toLowerCase() === "y" || again.toLowerCase() === "yes") {
          console.log("\nActualisation…");
          items = await loadInboxItems();
          continue;
        }
        break;
      }

      const selection = await ask(
        rl,
        "Choisissez une conversation (numéro, r=refresh, 0=quit) :\n> ",
      );

      if (selection === "0" || selection.toLowerCase() === "q") {
        break;
      }

      if (
        selection.toLowerCase() === "r" ||
        selection.toLowerCase() === "refresh"
      ) {
        console.log("\nActualisation…");
        items = await loadInboxItems();
        continue;
      }

      const num = Number.parseInt(selection, 10);
      if (!Number.isFinite(num) || num < 1 || num > items.length) {
        console.log("\nNuméro invalide.");
        await pause(rl);
        continue;
      }

      const result = await conversationLoop(rl, items, num - 1);
      if (result === "quit") break;

      console.log("\nActualisation de la liste…");
      items = await loadInboxItems();
    }
  } finally {
    rl.close();
  }

  console.log("\nÀ bientôt.\n");
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
