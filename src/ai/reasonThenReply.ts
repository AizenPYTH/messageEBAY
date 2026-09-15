import type { LlmCompletionResult } from "../ai/types.js";
import type { ReplyFactPack } from "../prompt/buildFactPack.js";
import { formatFactPackSection } from "../prompt/buildFactPack.js";
import {
  CORE_REPLY_PRINCIPLES,
  FORBIDDEN_UNLESS_BUYER_ASKED,
  STYLE_BANS,
} from "../prompt/policyRules.js";
import type { SellerProfile } from "../prompt/types.js";

export type ReplyReasoning = {
  asks: string[];
  factsToUse: string[];
  mustAvoid: string[];
  outline: string;
};

export type ReasonThenReplyResult = {
  reasoning: ReplyReasoning | null;
  reply: string;
  systemPrompt: string;
  userPrompt: string;
  reasoningRaw?: string;
  tokenUsage?: LlmCompletionResult["tokenUsage"];
};

type CompleteChat = (request: {
  systemPrompt: string;
  userPrompt: string;
  model: string;
}) => Promise<LlmCompletionResult>;

function mergeUsage(
  a?: LlmCompletionResult["tokenUsage"],
  b?: LlmCompletionResult["tokenUsage"],
): LlmCompletionResult["tokenUsage"] | undefined {
  if (!a && !b) return undefined;
  return {
    promptTokens: (a?.promptTokens ?? 0) + (b?.promptTokens ?? 0),
    completionTokens: (a?.completionTokens ?? 0) + (b?.completionTokens ?? 0),
    totalTokens: (a?.totalTokens ?? 0) + (b?.totalTokens ?? 0),
  };
}

function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

export function parseReplyReasoning(text: string): ReplyReasoning | null {
  const raw = extractJsonObject(text);
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string" && Boolean(x.trim()))
          .map((x) => x.trim())
      : [];
  const outline =
    typeof obj.outline === "string"
      ? obj.outline.trim()
      : typeof obj.plan === "string"
        ? obj.plan.trim()
        : "";
  if (!outline && asStringArray(obj.asks).length === 0) return null;
  return {
    asks: asStringArray(obj.asks ?? obj.buyerAsks),
    factsToUse: asStringArray(obj.factsToUse ?? obj.facts),
    mustAvoid: asStringArray(obj.mustAvoid ?? obj.avoid),
    outline: outline || "(répondre aux demandes listées, faits uniquement)",
  };
}

function reasoningSystemPrompt(): string {
  return [
    "Tu analyses une demande client eBay AVANT de rédiger la réponse.",
    "Tu ne rédiges PAS le message client.",
    "Réponds UNIQUEMENT avec un JSON valide, sans markdown :",
    '{"asks":["..."],"factsToUse":["..."],"mustAvoid":["..."],"outline":"une phrase"}',
    "",
    "Règles :",
    "- asks = ce que le client veut MAINTENANT. Si plusieurs messages d'affilée : lists TOUS les points, pas seulement le dernier.",
    "- Si le fil parle d'un RETOUR déjà envoyé (suivi) : outline = NO_REPLY — n'invente pas de stock / expédition.",
    "- Annonce Axxxx épuisée : si le shop a le même modèle ailleurs, outline = donner l'autre lien. INTERDIT « plus de A1989 du tout ».",
    "- Commande déjà passée (suivi, « expédier ce que j'ai commandé », nouvelles de la commande) : outline = suivi / expédition de CETTE commande. INTERDIT lien catalogue / autre annonce / « oui on a X en stock ».",
    "- factsToUse = uniquement des faits présents dans FAITS (titre + description inclus).",
    "- mustAvoid = sujets à ne pas inventer / pas demandés (PayPal, litige, retour, stock… si absents).",
    "- outline = plan de réponse en 1 phrase, concret — uniquement aux asks.",
    "- Si le ton est CONTRARIÉ : l'outline doit commencer par s'excuser.",
    "- Évite retours et litiges dans l'outline sauf si le client y insiste déjà.",
    "- Si le message n'attend rien (merci / ok / salutation seule) : outline = NO_REPLY.",
    "- Si un détail manque et tu ne peux pas répondre utilement avec les FAITS : outline = NO_REPLY. INTERDIT de planifier « je n'ai pas d'info ».",
    "- Inclus (Touch Bar, trackpad…) non écrit dans l'annonce : outline = NO_REPLY. INTERDIT d'inventer un non.",
    "- INTERDIT d'ajouter une info non demandée « au cas où ».",
    "- Facture / TVA : outline = NO_REPLY.",
    "- Garantie : 3 mois (fait boutique).",
  ].join("\n");
}

function draftSystemPrompt(
  languageLabel: string,
  signature?: string,
  buyerUpset?: boolean,
): string {
  return [
    "Tu es le vendeur eBay (humain). Rédige le message final au client.",
    "Tu t'appuies sur la DEMANDE ACTUELLE + FAITS. Si plusieurs points, réponds à chacun. Le fil récent sert seulement si le dernier message est un court suivi.",
    "",
    "Principes :",
    ...CORE_REPLY_PRINCIPLES.map((p) => `- ${p}`),
    "",
    "Interdits sauf demande claire du client :",
    ...FORBIDDEN_UNLESS_BUYER_ASKED.map((t) => `- ${t}`),
    "",
    "Style interdit :",
    ...STYLE_BANS.map((t) => `- ${t}`),
    "",
    buyerUpset
      ? "OBLIGATOIRE : le client est contrarié — première phrase = excuse courte."
      : "Ton : calme et direct.",
    `Langue obligatoire : ${languageLabel}.`,
    "Si tu ne peux pas répondre utilement avec les FAITS : NO_REPLY. INTERDIT « je n'ai pas d'informations / je ne peux pas confirmer ».",
    "Facture : NO_REPLY (ne dis jamais que tu l'as envoyée).",
    "Garantie : 3 mois.",
    "Sortie : uniquement le texte du message eBay (pas de JSON, pas de notes) — ou NO_REPLY.",
    signature?.trim()
      ? `Si tu réponds (pas NO_REPLY), termine avec exactement cette signature :\n${signature.trim()}`
      : "Si tu réponds (pas NO_REPLY), termine par exactement cette signature sur 2 lignes :\nCordialement,\nSNOWOLF",
  ].join("\n");
}

/**
 * Two-step generation: structured reasoning, then short grounded reply.
 */
export async function reasonThenReply(input: {
  factPack: ReplyFactPack;
  languageLabel: string;
  sellerProfile?: SellerProfile | null;
  conversationDigest: string;
  styleHints?: string;
  maxWords: number;
  model: string;
  completeChat: CompleteChat;
  repairNotes?: string;
}): Promise<ReasonThenReplyResult> {
  const factsBlock = formatFactPackSection(input.factPack);
  const twoStep = process.env.OPENAI_TWO_STEP === "1";

  const draftSystem = draftSystemPrompt(
    input.languageLabel,
    input.sellerProfile?.signature,
    input.factPack.buyerUpset,
  );

  // Default: 1 LLM call (cheap). Set OPENAI_TWO_STEP=1 for reason+draft.
  if (!twoStep) {
    const draftUser = [
      factsBlock,
      "",
      "========== FIL (même discussion, à lire) ==========",
      input.conversationDigest || "(vide)",
      input.styleHints
        ? `\n========== STYLE (ne pas recopier les sujets) ==========\n${input.styleHints}`
        : "",
      "",
      `Longueur max ~${input.maxWords} mots hors signature.`,
      "Réponds à TOUTE la DEMANDE ACTUELLE (chaque point s'il y en a plusieurs). Interdit d'inventer. Interdit un sujet non demandé.",
      input.repairNotes?.trim() ? input.repairNotes.trim() : "",
      "Si le client a envoyé un retour / n° de suivi de retour : NO_REPLY.",
      "NO_REPLY seulement si merci/ok/rien à dire — pas si la question est normale.",
    ]
      .filter(Boolean)
      .join("\n");

    const draftCompletion = await input.completeChat({
      systemPrompt: draftSystem,
      userPrompt: draftUser,
      model: input.model,
    });

    return {
      reasoning: null,
      reply: draftCompletion.text.trim(),
      systemPrompt: draftSystem,
      userPrompt: draftUser,
      tokenUsage: draftCompletion.tokenUsage,
    };
  }

  const reasonUser = [
    factsBlock,
    "",
    "========== FIL (même discussion, à lire) ==========",
    input.conversationDigest || "(vide)",
    input.styleHints
      ? `\n========== STYLE (ne pas recopier les sujets) ==========\n${input.styleHints}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const reasonCompletion = await input.completeChat({
    systemPrompt: reasoningSystemPrompt(),
    userPrompt: reasonUser,
    model: input.model,
  });

  const reasoning = parseReplyReasoning(reasonCompletion.text);

  // Early abstain: reasoning already decided there is nothing useful to send.
  if (
    reasoning &&
    (/^NO_REPLY\b/i.test(reasoning.outline.trim()) ||
      (reasoning.asks.length === 0 &&
        /rien|no reply|pas de r[eé]ponse/i.test(reasoning.outline)))
  ) {
    return {
      reasoning,
      reply: "NO_REPLY",
      systemPrompt: reasoningSystemPrompt(),
      userPrompt: reasonUser,
      reasoningRaw: reasonCompletion.text,
      tokenUsage: reasonCompletion.tokenUsage,
    };
  }

  const planBlock = reasoning
    ? [
        "========== PLAN DE RÉPONSE (issu du raisonnement) ==========",
        `Demandes : ${reasoning.asks.join(" | ") || "(voir FAITS)"}`,
        `Faits à utiliser : ${reasoning.factsToUse.join(" | ") || "(voir FAITS)"}`,
        `À éviter : ${reasoning.mustAvoid.join(" | ") || "(sujets non demandés)"}`,
        `Outline : ${reasoning.outline}`,
        `Longueur max ~${input.maxWords} mots hors signature.`,
      ].join("\n")
    : [
        "========== PLAN DE RÉPONSE ==========",
        "Raisonnement JSON illisible — réponds UNIQUEMENT à partir des FAITS.",
        `Longueur max ~${input.maxWords} mots hors signature.`,
        "Outline de secours : répondre point par point aux demandes dans FAITS.",
        input.factPack.buyerUpset
          ? "Commencer par une excuse courte."
          : "",
      ]
        .filter(Boolean)
        .join("\n");

  const draftUser = [factsBlock, "", planBlock, input.repairNotes?.trim() ?? ""]
    .filter(Boolean)
    .join("\n");

  const draftCompletion = await input.completeChat({
    systemPrompt: draftSystem,
    userPrompt: draftUser,
    model: input.model,
  });

  return {
    reasoning,
    reply: draftCompletion.text.trim(),
    systemPrompt: `${reasoningSystemPrompt()}\n\n---\n\n${draftSystem}`,
    userPrompt: `${reasonUser}\n\n---\n\n${draftUser}`,
    reasoningRaw: reasonCompletion.text,
    tokenUsage: mergeUsage(
      reasonCompletion.tokenUsage,
      draftCompletion.tokenUsage,
    ),
  };
}
