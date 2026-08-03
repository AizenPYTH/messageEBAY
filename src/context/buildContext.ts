import {
  findConversationSummary,
  getConversationMessages,
  type EbayMessage,
} from "../ebay/messageApi.js";
import { getListingDetails, type ListingDetails } from "../ebay/tradingApi.js";

const DESCRIPTION_MAX_CHARS = 4000;

export type AssistantContext = {
  conversationId: string;
  listingItemId?: string;
  listing?: ListingDetails;
  listingError?: string;
  messages: EbayMessage[];
  latestMessage?: EbayMessage;
  notes: string[];
  promptContext: string;
};

function valueOrUnavailable(value: string | undefined): string {
  return value?.trim() ? value.trim() : "(non disponible)";
}

function formatSpecifics(
  specifics: Array<{ name: string; value: string }>,
): string {
  if (specifics.length === 0) return "(non disponible)";

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

function formatDispatchTime(value: string | undefined): string {
  if (value === undefined || value === "") return "(non disponible)";
  if (value === "0") return "0 jour (expédition le jour même selon eBay)";
  return `${value} jour(s) ouvré(s)`;
}

function sortMessagesChronologically(messages: EbayMessage[]): EbayMessage[] {
  return [...messages].sort((a, b) => {
    const ta = a.createdDate ? Date.parse(a.createdDate) : 0;
    const tb = b.createdDate ? Date.parse(b.createdDate) : 0;
    return ta - tb;
  });
}

function formatConversation(messages: EbayMessage[]): string {
  if (messages.length === 0) return "(aucun message)";

  return messages
    .map((m) => {
      const when = m.createdDate ?? "?";
      const from = m.senderUsername ?? "?";
      const text = m.messageBody?.trim() || "(vide)";
      return `[${when}] ${from}: ${text}`;
    })
    .join("\n");
}

function buildListingSection(
  listing: ListingDetails | undefined,
  listingError: string | undefined,
  notes: string[],
): string {
  if (!listing) {
    return [
      "=== Informations annonce ===",
      "",
      `Statut: (non disponible)`,
      `Raison: ${listingError ?? "référence LISTING absente"}`,
      "",
      ...notes.map((n) => `Note: ${n}`),
    ].join("\n");
  }

  let description = listing.descriptionText?.trim() || "(non disponible)";
  if (description.length > DESCRIPTION_MAX_CHARS) {
    description =
      description.slice(0, DESCRIPTION_MAX_CHARS) +
      "\n… [description tronquée]";
    notes.push(
      `Description tronquée à ${DESCRIPTION_MAX_CHARS} caractères pour le contexte.`,
    );
  }

  return [
    "=== Informations annonce ===",
    "",
    `Identifiant: ${valueOrUnavailable(listing.itemId)}`,
    `Titre: ${valueOrUnavailable(listing.title)}`,
    `Description:`,
    description,
    "",
    `Catégorie: ${valueOrUnavailable(listing.categoryName)} (id=${valueOrUnavailable(listing.categoryId)})`,
    `Etat: ${valueOrUnavailable(listing.condition)} (conditionId=${valueOrUnavailable(listing.conditionId)})`,
    `Prix: ${valueOrUnavailable(listing.price)} ${valueOrUnavailable(listing.currency)}`,
    `Stock: quantité=${valueOrUnavailable(listing.quantity)}, vendus=${valueOrUnavailable(listing.quantitySold)}`,
    `Statut annonce: ${valueOrUnavailable(listing.listingStatus)}`,
    `Localisation: ${valueOrUnavailable(listing.location)}`,
    "",
    "Caractéristiques:",
    formatSpecifics(listing.itemSpecifics),
    "",
    "=== Informations vendeur ===",
    "",
    `Pseudo: ${valueOrUnavailable(listing.sellerUsername)}`,
    `Score feedback: ${valueOrUnavailable(listing.sellerFeedbackScore)}`,
    "",
    "=== Politique retour / expédition ===",
    "",
    `Retours acceptés: ${valueOrUnavailable(listing.returnsAccepted)}`,
    `Délai de retour: ${valueOrUnavailable(listing.returnsWithin)}`,
    `Frais de retour: ${valueOrUnavailable(listing.shippingCostPaidBy)}`,
    `Délai d'expédition (DispatchTimeMax): ${formatDispatchTime(listing.dispatchTimeMax)}`,
    "",
    ...notes.map((n) => `Note: ${n}`),
  ].join("\n");
}

export async function buildAssistantContext(
  conversationId: string,
): Promise<AssistantContext> {
  const notes: string[] = [
    "Source annonce: Trading API GetItem (via referenceId LISTING de Message API).",
    "Browse API non utilisée ici: scope buy.browse absent du token actuel.",
    "Champ RefundOption parfois absent de GetItem — non inventé.",
  ];

  const summary = await findConversationSummary(conversationId);
  const detail = await getConversationMessages(conversationId, "FROM_MEMBERS");
  const messages = sortMessagesChronologically(detail.messages ?? []);
  const latestMessage = messages[messages.length - 1];

  let listing: ListingDetails | undefined;
  let listingError: string | undefined;
  let listingItemId = summary?.referenceId;

  if (!summary) {
    notes.push(
      "Conversation absente de GET /conversation (liste). referenceId peut être manquant.",
    );
  }

  if (summary?.referenceType && summary.referenceType !== "LISTING") {
    notes.push(
      `referenceType=${summary.referenceType} (attendu LISTING).`,
    );
  }

  if (!listingItemId) {
    listingError =
      "Aucun referenceId LISTING dans la conversation Message API. Impossible de charger l'annonce automatiquement.";
    notes.push(
      "Alternative: passer manuellement un itemId plus tard, ou lier la conversation à une annonce côté eBay.",
    );
  } else {
    const result = await getListingDetails(listingItemId);
    if (result.ok) {
      listing = result.listing;
    } else {
      listingError = result.reason;
    }
  }

  const listingSection = buildListingSection(listing, listingError, notes);
  const conversationSection = [
    "=== Conversation complète ===",
    "",
    formatConversation(messages),
  ].join("\n");

  const latestSection = [
    "=== Dernier message ===",
    "",
    latestMessage
      ? `[${latestMessage.createdDate ?? "?"}] ${latestMessage.senderUsername ?? "?"}: ${latestMessage.messageBody ?? "(vide)"}`
      : "(aucun message)",
  ].join("\n");

  const promptContext = [listingSection, conversationSection, latestSection]
    .join("\n\n")
    .trim();

  return {
    conversationId,
    listingItemId,
    listing,
    listingError,
    messages,
    latestMessage,
    notes,
    promptContext,
  };
}
