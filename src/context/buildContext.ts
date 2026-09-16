import {
  findConversationSummary,
  getConversationMessages,
  type EbayMessage,
} from "../ebay/messageApi.js";
import { getListingDetails, type ListingDetails } from "../ebay/tradingApi.js";
import {
  findCatalogListingByTitle,
  getCatalogListingTitle,
} from "../database/repositories/listings.js";
import { collectCandidateItemIds } from "../ebay/resolveListingRef.js";

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
    "Source annonce: Trading API GetItem (referenceId, lien itm, ou titre catalogue).",
  ];

  const detail = await getConversationMessages(conversationId, "FROM_MEMBERS");
  const messages = sortMessagesChronologically(detail.messages ?? []);
  const latestMessage = messages[messages.length - 1];

  const needListLookup = !detail.referenceId || !detail.conversationTitle;
  const summary = needListLookup
    ? await findConversationSummary(conversationId)
    : undefined;
  const conversationTitle =
    detail.conversationTitle?.trim() || summary?.conversationTitle?.trim();

  let listing: ListingDetails | undefined;
  let listingError: string | undefined;

  const candidates = collectCandidateItemIds({
    conversationId,
    referenceId: detail.referenceId || summary?.referenceId,
    referenceType: detail.referenceType || summary?.referenceType,
    conversationTitle,
    messageBodies: messages.map((m) => m.messageBody),
  });

  if (!summary) {
    notes.push(
      "Conversation absente des premières pages GET /conversation — id cherché aussi dans le détail / messages.",
    );
  }

  const refType = detail.referenceType || summary?.referenceType;
  if (refType && refType !== "LISTING") {
    notes.push(`referenceType=${refType} (pas LISTING) — autres sources utilisées.`);
  }

  async function loadByItemId(itemId: string): Promise<ListingDetails | undefined> {
    const result = await getListingDetails(itemId);
    if (result.ok) return result.listing;
    const catalogTitle = await getCatalogListingTitle(itemId);
    if (!catalogTitle) return undefined;
    notes.push(`Titre catalogue local (GetItem: ${result.reason}).`);
    return {
      itemId,
      title: catalogTitle,
      itemSpecifics: [],
      compatibility: [],
      variations: [],
      shippingOptions: [],
      rawAvailable: true,
    };
  }

  let listingItemId = candidates[0];
  for (const id of candidates) {
    const loaded = await loadByItemId(id);
    if (loaded) {
      listing = loaded;
      listingItemId = id;
      break;
    }
  }

  if (!listing && conversationTitle) {
    const byTitle = await findCatalogListingByTitle(conversationTitle);
    if (byTitle?.item_id) {
      listingItemId = byTitle.item_id;
      listing = await loadByItemId(byTitle.item_id);
      if (listing) {
        notes.push("Annonce retrouvée via le titre de conversation (catalogue).");
      }
    }
  }

  if (!listing) {
    listingError = listingItemId
      ? `Annonce ${listingItemId} introuvable (GetItem + catalogue).`
      : "Aucun identifiant d'annonce dans cette conversation (pas de référence eBay, lien itm, ni titre catalogue).";
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
