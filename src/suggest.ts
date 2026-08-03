import OpenAI from "openai";
import { config, ebayUrls } from "./config.js";

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
  conversationTitle?: string;
  errors?: Array<{ message?: string; longMessage?: string }>;
};

async function fetchConversationMessages(
  conversationId: string,
  conversationType: "FROM_MEMBERS" | "FROM_EBAY",
): Promise<ConversationDetail> {
  if (!config.accessToken) {
    throw new Error(
      "EBAY_USER_ACCESS_TOKEN manquant. Lance d'abord : npm run auth",
    );
  }

  const url = new URL(
    `${ebayUrls.messageApi}/conversation/${encodeURIComponent(conversationId)}`,
  );
  url.searchParams.set("conversation_type", conversationType);
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

async function main(): Promise<void> {
  const conversationId = process.argv[2]?.trim();
  const conversationType = (
    process.argv[3]?.trim() || "FROM_MEMBERS"
  ) as "FROM_MEMBERS" | "FROM_EBAY";

  if (!conversationId) {
    throw new Error(
      "Usage: npm run suggest -- <conversationId> [FROM_MEMBERS|FROM_EBAY]",
    );
  }

  console.log("\n=== OpenAI GPT-5.5 — suggestion (pas d'envoi eBay) ===\n");
  console.log(`conversationId=${conversationId}`);
  console.log(`type=${conversationType}`);
  console.log(`model=${MODEL}\n`);

  const data = await fetchConversationMessages(
    conversationId,
    conversationType,
  );
  const latest = getLatestMessage(data.messages ?? []);

  console.log("--- Dernier message ---");
  console.log(`from=${latest.senderUsername ?? "?"}`);
  console.log(`date=${latest.createdDate ?? "?"}`);
  console.log(`text=${latest.messageBody}`);
  console.log("");

  console.log("Appel OpenAI...");
  const suggestion = await generateSuggestion(latest.messageBody!);

  console.log("\n--- Réponse GPT-5.5 ---");
  console.log(suggestion);
  console.log("");
  console.log("(Non envoyé sur eBay)");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
