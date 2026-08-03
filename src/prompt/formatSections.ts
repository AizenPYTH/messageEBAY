import type { ResponsePlan } from "../analysis/types.js";
import type { EbayMessage } from "../ebay/messageApi.js";
import type { ListingDetails } from "../ebay/tradingApi.js";
import type {
  DetectedLanguage,
  SellerProfile,
  SimilarConversationSnippet,
} from "./types.js";

function v(value: string | undefined | null): string {
  return value?.trim() ? value.trim() : "(non disponible)";
}

function formatSpecifics(
  specifics: Array<{ name: string; value: string }> | undefined,
): string {
  if (!specifics?.length) return "(non disponible)";

  const grouped = new Map<string, string[]>();
  for (const s of specifics) {
    const list = grouped.get(s.name) ?? [];
    list.push(s.value);
    grouped.set(s.name, list);
  }

  return [...grouped.entries()]
    .map(([name, values]) => `- ${name}: ${[...new Set(values)].join(", ")}`)
    .join("\n");
}

function formatDispatch(value: string | undefined): string {
  if (value === undefined || value === "") return "(non disponible)";
  if (value === "0") return "0 jour (jour même selon eBay)";
  return `${value} jour(s)`;
}

export function formatSellerSection(
  listing: ListingDetails | undefined,
  profile: SellerProfile | undefined,
  language: DetectedLanguage,
): string {
  const languages =
    profile?.languages?.length
      ? profile.languages.join(", ")
      : language.label;

  return [
    "========== VENDEUR ==========",
    `Nom : ${v(profile?.displayName ?? listing?.sellerUsername)}`,
    `Pays : ${v(profile?.country ?? listing?.location)}`,
    `Langues : ${v(languages)}`,
    `Langue de réponse (message client) : ${language.label}`,
    `Ton : ${v(profile?.tone)}`,
    `Style : ${v(profile?.style)}`,
    `Politique d'expédition : ${v(
      profile?.shippingDelayText ?? formatDispatch(listing?.dispatchTimeMax),
    )}`,
    `Politique de retour : ${v(
      profile?.returnPolicyText ??
        (listing
          ? `${listing.returnsAccepted ?? "?"} / délai ${listing.returnsWithin ?? "?"} / frais ${listing.shippingCostPaidBy ?? "?"}`
          : undefined),
    )}`,
    `Politique de remboursement : ${v(profile?.refundPolicyText)}`,
    `Politique de négociation : ${v(profile?.negotiationPolicyText)}`,
    `Signature : ${v(profile?.signature)}`,
    `Score feedback annonce : ${v(listing?.sellerFeedbackScore)}`,
  ].join("\n");
}

export function formatListingSection(
  listing: ListingDetails | undefined,
  listingError: string | undefined,
  listingItemId: string | undefined,
  maxDescriptionChars: number,
  compact = false,
): { section: string; truncatedDescription: boolean } {
  if (!listing) {
    return {
      section: [
        "========== ANNONCE ==========",
        `Identifiant : ${v(listingItemId)}`,
        "Titre : (non disponible)",
        "Description : (non disponible)",
        "Prix : (non disponible)",
        "État : (non disponible)",
        "Caractéristiques : (non disponible)",
        "Catégorie : (non disponible)",
        `Erreur : ${v(listingError)}`,
      ].join("\n"),
      truncatedDescription: false,
    };
  }

  if (compact) {
    const compactSpecifics = formatSpecifics(listing.itemSpecifics.slice(0, 8));
    const descSnippet = listing.descriptionText?.trim()
      ? listing.descriptionText.trim().slice(0, 280)
      : "(non disponible)";
    return {
      section: [
        "========== ANNONCE (contexte compact) ==========",
        "Utilise ces faits seulement s'ils répondent directement à la question.",
        "Ne récite pas cette section dans ta réponse.",
        `Identifiant : ${v(listing.itemId)}`,
        `Titre : ${v(listing.title)}`,
        `Prix : ${v(listing.price)} ${v(listing.currency)}`,
        `État : ${v(listing.condition)}`,
        `Statut : ${v(listing.listingStatus)}`,
        `Stock : qty=${v(listing.quantity)}`,
        `Extrait description : ${descSnippet}`,
        "Caractéristiques clés :",
        compactSpecifics,
      ].join("\n"),
      truncatedDescription: true,
    };
  }

  let description = listing.descriptionText?.trim() || "(non disponible)";
  let truncatedDescription = false;
  if (description.length > maxDescriptionChars) {
    description = `${description.slice(0, maxDescriptionChars)}\n… [description tronquée]`;
    truncatedDescription = true;
  }

  return {
    section: [
      "========== ANNONCE ==========",
      "Contexte uniquement — ne pas réciter sauf nécessité.",
      `Identifiant : ${v(listing.itemId)}`,
      `Titre : ${v(listing.title)}`,
      "Description :",
      description,
      `Prix : ${v(listing.price)} ${v(listing.currency)}`,
      `État : ${v(listing.condition)}`,
      "Caractéristiques :",
      formatSpecifics(listing.itemSpecifics),
      `Catégorie : ${v(listing.categoryName)}`,
      `Statut : ${v(listing.listingStatus)}`,
      `Stock : qty=${v(listing.quantity)} vendus=${v(listing.quantitySold)}`,
    ].join("\n"),
    truncatedDescription,
  };
}

export function selectMessagesForPrompt(
  messages: EbayMessage[],
  maxMessages: number,
): { messages: EbayMessage[]; truncated: boolean } {
  if (messages.length <= maxMessages) {
    return { messages, truncated: false };
  }
  return {
    messages: messages.slice(messages.length - maxMessages),
    truncated: true,
  };
}

export function formatConversationSection(
  messages: EbayMessage[],
  truncated: boolean,
): string {
  const lines = [
    "========== CONVERSATION ==========",
    truncated
      ? "(historique tronqué : seuls les messages les plus récents sont inclus)"
      : "(historique chronologique complet dans la fenêtre retenue)",
    "",
  ];

  if (messages.length === 0) {
    lines.push("(aucun message)");
    return lines.join("\n");
  }

  for (const m of messages) {
    lines.push(`Auteur : ${v(m.senderUsername)}`);
    lines.push(`Date : ${v(m.createdDate)}`);
    lines.push(`Texte : ${v(m.messageBody)}`);
    lines.push("---");
  }

  return lines.join("\n");
}

export function formatLatestMessageSection(message: EbayMessage | undefined): string {
  return [
    "========== DERNIER MESSAGE ==========",
    `Auteur : ${v(message?.senderUsername)}`,
    `Date : ${v(message?.createdDate)}`,
    `Texte : ${v(message?.messageBody)}`,
  ].join("\n");
}

/**
 * Étape 8 — emplacement Prompt Engine pour le RAG.
 * Alimenté via `similarConversations` (ex: rag.toPromptSimilarSnippets).
 * Pas encore branché sur suggest/autoreply/prompt CLI.
 */
export function formatMemorySection(
  similar: SimilarConversationSnippet[] | undefined,
): string | undefined {
  if (!similar?.length) return undefined;

  const lines = [
    "========== CONVERSATIONS SIMILAIRES ==========",
    "Inspire-toi de ces échanges passés du vendeur. N'invente rien au-delà.",
    "",
  ];

  for (const [index, item] of similar.entries()) {
    lines.push(`Conversation ${index + 1}`);
    lines.push(`ID: ${item.conversationId}`);
    if (item.score !== undefined) {
      lines.push(`Score: ${item.score.toFixed(4)}`);
    }
    lines.push(item.summary);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function formatInstructionsSection(
  language: DetectedLanguage,
  profile: SellerProfile | undefined,
  plan?: ResponsePlan,
): string {
  const rules = [
    "========== CONSIGNES ==========",
    "- Réponds uniquement avec le message final destiné au client.",
    `- Langue obligatoire : ${language.label}.`,
    "- N'utilise que les faits présents dans ANNONCE / VENDEUR / CONVERSATION / CONVERSATIONS SIMILAIRES.",
    "- Ne promets pas remboursement/échange/remise sans mention explicite ci-dessus.",
    "- Respecte strictement le profil vendeur (ton, style, politiques, signature).",
    "- Ne récite pas l'annonce. Pas de copier-coller du titre/specs/prix sauf question explicite.",
  ];

  if (plan) {
    rules.push("========== PLAN DE RÉPONSE ==========");
    rules.push(`- Type de question : ${plan.intentLabel}`);
    rules.push(`- Longueur recommandée : ${plan.recommendedLength} (~${plan.maxWords} mots max hors signature)`);
    rules.push(`- Niveau de détail : ${plan.detailLevel}`);
    if (plan.closedQuestionTopic) {
      rules.push(`- Sujet détecté : ${plan.closedQuestionTopic}`);
    }
    if (plan.listingAnswerability) {
      rules.push(`- Couverture annonce : ${plan.listingAnswerability}`);
    }
    if (plan.listingEvidence?.length) {
      rules.push(`- Preuves annonce : ${plan.listingEvidence.join(" | ")}`);
    }
    if (plan.listingAnswerability === "direct_yes" || plan.listingAnswerability === "direct_no") {
      rules.push("- Réponds OUI/NON de façon naturelle et confiante.");
      rules.push('- N\'ajoute PAS "Je ne peux pas confirmer...".');
      if (plan.suggestedDirectReply) {
        rules.push(`- Réponse cible : ${plan.suggestedDirectReply}`);
      }
    } else if (plan.listingAnswerability === "unknown") {
      rules.push(
        '- Info absente de l\'annonce : utilise alors seulement "Je ne peux pas confirmer cette information à partir des données disponibles."',
      );
    } else {
      rules.push(
        "- Formule prudente uniquement si l'information demandée est vraiment absente de l'annonce.",
      );
    }
    if (plan.avoidListingRecap) {
      rules.push("- Interdiction de reformuler/résumer l'annonce.");
    }
    if (plan.isSimpleQuestion) {
      rules.push("- Format attendu : Bonjour + 1 réponse directe + signature.");
    }
    if (plan.isMultiQuestion) {
      rules.push("- Réponds point par point à chaque question.");
    }
  }

  if (profile?.tone) {
    rules.push(`- Ton / adresse : ${profile.tone}.`);
  }

  if (profile?.negotiationAllowed === false) {
    rules.push("- La négociation de prix n'est pas autorisée.");
  }

  if (profile?.customRules?.length) {
    for (const rule of profile.customRules) {
      rules.push(`- ${rule}`);
    }
  }

  if (profile?.signature?.trim()) {
    rules.push(
      `- Termine le message avec exactement cette signature (ne pas inventer une autre) :\n${profile.signature.trim()}`,
    );
  }

  return rules.join("\n");
}
