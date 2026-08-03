import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import OpenAI from "openai";
import { isMainModule } from "./cli/isMain.js";
import { config, ebayUrls } from "./config.js";
import { sendConversationMessage } from "./ebay/sendMessage.js";

const MODEL = "gpt-5.5";

type Message = {
  messageId?: string;
  messageBody?: string;
  senderUsername?: string;
  recipientUsername?: string;
  createdDate?: string;
};

type ConversationDetail = {
  messages?: Message[];
  errors?: Array<{ message?: string; longMessage?: string }>;
};

export type AutoreplyOptions = {
  /** Override confirmation prompt (useful when a parent CLI already owns stdin). */
  confirmSend?: () => Promise<boolean>;
};

async function fetchConversationMessages(
  conversationId: string,
): Promise<ConversationDetail> {
  if (!config.accessToken) {
    throw new Error(
      "EBAY_USER_ACCESS_TOKEN manquant. Lance d'abord : npm run auth",
    );
  }

  const url = new URL(
    `${ebayUrls.messageApi}/conversation/${encodeURIComponent(conversationId)}`,
  );
  url.searchParams.set("conversation_type", "FROM_MEMBERS");
  url.searchParams.set("limit", "50");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  const data = (await response.json()) as ConversationDetail;

  if (!response.ok) {
    const detail =
      data.errors?.map((e) => e.longMessage ?? e.message).join("; ") ??
      JSON.stringify(data);
    throw new Error(
      `GET /conversation/${conversationId} failed: ${response.status} ${detail}`,
    );
  }

  return data;
}

function getLatestMessage(messages: Message[]): Message {
  const sorted = [...messages].sort((a, b) => {
    const ta = a.createdDate ? Date.parse(a.createdDate) : 0;
    const tb = b.createdDate ? Date.parse(b.createdDate) : 0;
    return tb - ta;
  });

  const latest = sorted[0];
  if (!latest?.messageBody?.trim()) {
    throw new Error("Aucun message texte trouvé dans cette conversation.");
  }

  return latest;
}

async function generateSuggestion(lastMessage: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Missing env var: OPENAI_API_KEY");
  }

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Tu aides un vendeur eBay. Rédige une réponse courte, polie et utile au message acheteur. Réponds uniquement avec le texte du message, sans explication.",
      },
      {
        role: "user",
        content: lastMessage,
      },
    ],
  });

  const text = completion.choices[0]?.message?.content?.trim();
  if (!text) {
    throw new Error("Réponse OpenAI vide.");
  }

  return text;
}

async function defaultConfirmSend(): Promise<boolean> {
  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question("Envoyer cette réponse sur eBay ? (y/N) "))
      .trim()
      .toLowerCase();
    return answer === "y" || answer === "yes";
  } finally {
    rl.close();
  }
}

export async function runAutoreplyCommand(
  conversationId: string,
  options: AutoreplyOptions = {},
): Promise<void> {
  const id = conversationId.trim();
  if (!id) {
    throw new Error("conversationId is required");
  }

  console.log("\n=== Autoreply (confirmation manuelle) ===\n");
  console.log(`conversationId=${id}`);
  console.log(`model=${MODEL}\n`);

  const data = await fetchConversationMessages(id);
  const latest = getLatestMessage(data.messages ?? []);

  console.log("--- Dernier message ---");
  console.log(`from=${latest.senderUsername ?? "?"}`);
  console.log(`date=${latest.createdDate ?? "?"}`);
  console.log(`text=${latest.messageBody}`);
  console.log("");

  console.log("Génération GPT-5.5...");
  const suggestion = await generateSuggestion(latest.messageBody!);

  console.log("\n--- Réponse proposée ---");
  console.log(suggestion);
  console.log("");

  const confirm = options.confirmSend ?? defaultConfirmSend;
  const confirmed = await confirm();
  if (!confirmed) {
    console.log("Annulé — rien n'a été envoyé.");
    return;
  }

  console.log("\nEnvoi via POST /send_message...");
  const result = await sendConversationMessage(id, suggestion);

  console.log(`HTTP ${result.status}`);
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
  if (!conversationId) {
    throw new Error("Usage: npm run autoreply -- <conversationId>");
  }
  await runAutoreplyCommand(conversationId);
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
