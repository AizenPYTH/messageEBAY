import { detectAllListingTopics } from "../analysis/listingEvidence.js";
import {
  isOemGenericAsk,
  repairListingFactLine,
  workingPartFactLine,
} from "../analysis/sellerOps.js";
import type { ClosedQuestionTopic } from "../analysis/types.js";
import type { ListingDetails } from "../ebay/tradingApi.js";
import { listingHasDomesticFreeShipping, listingHasInternationalFreeShipping, isShippingCostAsk } from "../shipping/shippingCost.js";
import { isTrackingRequest } from "../shipping/detectTracking.js";

const SPEC_ASK =
  /\b(ram|m[ée]moire|stockage|capacit[ée]|tactile|usb|bootloader|batterie|mod[eè]le|s['’]agit[- ]il|confirme[rz]|n10|n100)\b/i;

const PRICE_ASK =
  /\b(prix|tarif|combien|how much|cost|cher)\b/i;

function wantsShipping(ask: string, topics: ClosedQuestionTopic[]): boolean {
  return (
    topics.includes("fast_shipping") ||
    isShippingCostAsk(ask) ||
    isTrackingRequest(ask)
  );
}

function wantsProductDetail(topics: ClosedQuestionTopic[], ask: string): boolean {
  if (isOemGenericAsk(ask) || /\bgrade\s*[ab]\b/i.test(ask)) return true;
  return topics.some((t) =>
    [
      "compatible",
      "oem_generic",
      "functional",
      "condition",
      "battery_original",
      "charger_included",
      "keyboard_layout",
      "unlocked",
    ].includes(t),
  );
}

/**
 * Only the listing facts needed for THIS ask.
 * Dumping stock + shipping + returns + description is what made the model
 * answer the wrong topic.
 */
export function selectListingFacts(
  listing: ListingDetails | undefined,
  currentAsk: string,
): string[] {
  if (!listing) return ["Annonce : détails non disponibles — n'invente rien."];

  const topics = detectAllListingTopics(currentAsk);
  const askPrice = PRICE_ASK.test(currentAsk);
  const ship = wantsShipping(currentAsk, topics);
  const product = wantsProductDetail(topics, currentAsk);
  const stock = topics.includes("available") || /\b(dispo|disponible|stock|avez[- ]vous)\b/i.test(currentAsk);
  const specAsk = SPEC_ASK.test(currentAsk);
  const listingBlob = `${listing.title ?? ""}\n${listing.descriptionText ?? ""}`;
  const repairLine = repairListingFactLine(listingBlob);
  const workingLine = workingPartFactLine(listingBlob, currentAsk);
  const listingType = (listing.listingType ?? "").trim();
  const auctionType = /^(chinese|dutch|live|auction)$/i.test(listingType);

  const lines: string[] = [];
  if (listing.itemId) lines.push(`ItemID : ${listing.itemId}`);
  if (listing.title?.trim()) lines.push(`Titre : ${listing.title.trim()}`);
  if (listingType) {
    if (auctionType) {
      const bin = Number.parseFloat((listing.buyItNowPrice ?? "").replace(",", "."));
      const hasBin = Number.isFinite(bin) && bin > 0;
      lines.push(
        hasBin
          ? `Format annonce : ENCHÈRE avec achat immédiat à ${listing.buyItNowPrice} ${listing.currency ?? ""}`.trim()
          : "Format annonce : ENCHÈRE — PAS d'achat immédiat. Il faut enchérir sur eBay. INTERDIT de dire que l'achat immédiat est possible.",
      );
    } else {
      lines.push(`Format annonce : ${listingType} (achat immédiat)`);
    }
  }
  if (repairLine) lines.push(repairLine);
  if (workingLine) lines.push(workingLine);
  if (listing.listingStatus?.trim()) {
    lines.push(`Statut annonce : ${listing.listingStatus.trim()}`);
  }

  if (stock) {
    if (typeof listing.quantityAvailable === "number") {
      lines.push(`Stock dispo (annonce) = ${listing.quantityAvailable}`);
    } else if (listing.quantity !== undefined) {
      lines.push(`Stock qty=${listing.quantity}`);
    }
  }

  if (askPrice && listing.price) {
    lines.push(
      auctionType
        ? `Prix actuel (enchère) : ${listing.price}${listing.currency ? ` ${listing.currency}` : ""} — pas un achat immédiat`
        : `Prix : ${listing.price}${listing.currency ? ` ${listing.currency}` : ""}`,
    );
  }

  if (topics.includes("condition") && listing.condition?.trim()) {
    lines.push(`État : ${listing.condition.trim()}`);
  }

  if (ship) {
    if (listing.dispatchTimeMax !== undefined && listing.dispatchTimeMax !== "") {
      lines.push(
        `Délai expédition (DispatchTimeMax) = ${listing.dispatchTimeMax} jour(s)`,
      );
    }
    for (const opt of listing.shippingOptions?.slice(0, 6) ?? []) {
      const zone = opt.international ? "étranger" : "France";
      const bits = [
        opt.service,
        opt.cost
          ? `${opt.cost}${listing.currency ? ` ${listing.currency}` : ""}`
          : undefined,
      ].filter(Boolean);
      if (bits.length) lines.push(`Livraison (${zone}) : ${bits.join(" · ")}`);
    }
    if (
      listingHasDomesticFreeShipping(listing) &&
      !listingHasInternationalFreeShipping(listing)
    ) {
      lines.push("ATTENTION : 0 € = France uniquement, pas l'étranger.");
    }
  }

  if (product || specAsk || Boolean(repairLine) || Boolean(workingLine)) {
    const specs = listing.itemSpecifics?.slice(0, 8) ?? [];
    for (const s of specs) {
      if (s.name && s.value) lines.push(`${s.name} : ${s.value}`);
    }
    const variations = listing.variations ?? [];
    if (variations.length) {
      lines.push("Variantes :");
      for (const v of variations.slice(0, 12)) {
        const label =
          v.specifics.map((x) => `${x.name}=${x.value}`).join(", ") ||
          v.sku ||
          "variante";
        lines.push(`- ${label} → dispo ${v.quantityAvailable}`);
      }
    }
    const desc = listing.descriptionText?.replace(/\s+/g, " ").trim();
    if (desc) {
      const max = 900;
      lines.push(
        `Description : ${desc.length > max ? `${desc.slice(0, max)}…` : desc}`,
      );
    }
  }

  if (lines.length <= 2) {
    lines.push(
      "Faits minimaux seulement — n'ajoute ni stock, ni livraison, ni prix si ce n'est pas demandé.",
    );
  }

  return lines;
}

export function listingFactBlob(
  listing: ListingDetails | undefined,
  currentAsk: string,
): string {
  return selectListingFacts(listing, currentAsk).join("\n");
}
