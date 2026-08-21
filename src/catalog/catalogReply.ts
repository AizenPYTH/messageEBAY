import type { ListingAnswerability } from "../analysis/types.js";
import {
  casualCatalogLabel,
  casualProductNickname,
  SAME_DAY_BEFORE_15,
} from "../seller/casualPhrases.js";
import type { CatalogHit } from "./searchCatalog.js";

export type CatalogReplyResult = {
  reply: string | null;
  answerability: ListingAnswerability;
  signals: string[];
};

function wrapReply(
  body: string,
  languageCode: string | undefined,
  signature: string | undefined,
): string {
  const sig = signature?.trim() || "Cordialement,\nSNOWOLF";
  return languageCode === "en"
    ? `Hi,\n\n${body}\n\n${sig}`
    : `Bonjour,\n\n${body}\n\n${sig}`;
}

function shippingBit(parts: string[]): string {
  if (parts.length === 0) return SAME_DAY_BEFORE_15;
  return parts.join(" ").replace(/\.$/, "");
}

/** One casual paragraph: current item + shipping + other product. */
function formatForeignYes(input: {
  hit: CatalogHit;
  label: string;
  shippingParts: string[];
  currentListingTitle?: string | null;
  currentListingInStock?: boolean;
  languageCode?: string;
}): string {
  const hit = input.hit;
  const other = casualCatalogLabel(hit.title || input.label, input.label);
  const nick = casualProductNickname(input.currentListingTitle);
  const ship = shippingBit(input.shippingParts);

  if (input.languageCode === "en") {
    const here =
      input.currentListingInStock === false
        ? ""
        : `Yes the ${nick} is still available, ${ship}. `;
    return `${here}Yes we have ${other} in stock, here's the link: ${hit.itemUrl}`;
  }

  const here =
    input.currentListingInStock === false
      ? ""
      : `Oui le ${nick} est tjr dispo, ${ship}. `;
  return `${here}Oui on a ${other} en stock, voici le lien : ${hit.itemUrl}`;
}

function formatForeignMulti(input: {
  hits: CatalogHit[];
  label: string;
  shippingParts: string[];
  currentListingTitle?: string | null;
  currentListingInStock?: boolean;
  languageCode?: string;
}): string {
  const nick = casualProductNickname(input.currentListingTitle);
  const ship = shippingBit(input.shippingParts);
  const first = input.hits[0]!;
  const other = casualCatalogLabel(first.title || input.label, input.label);

  if (input.languageCode === "en") {
    const here =
      input.currentListingInStock === false
        ? ""
        : `Yes the ${nick} is still available, ${ship}. `;
    return `${here}Yes we have ${other} in stock, here's the link: ${first.itemUrl}`;
  }

  const here =
    input.currentListingInStock === false
      ? ""
      : `Oui le ${nick} est tjr dispo, ${ship}. `;
  return `${here}Oui on a ${other} en stock, voici le lien : ${first.itemUrl}`;
}

function formatForeignNo(input: {
  label: string;
  shippingParts: string[];
  oos: boolean;
  currentListingTitle?: string | null;
  currentListingInStock?: boolean;
  languageCode?: string;
}): string {
  const nick = casualProductNickname(input.currentListingTitle);
  const ship = shippingBit(input.shippingParts);
  const other = input.label.trim() || "ça";

  if (input.languageCode === "en") {
    const here =
      input.currentListingInStock === false
        ? ""
        : `Yes the ${nick} is still available, ${ship}. `;
    const p = input.oos
      ? `No, ${other} is out of stock right now.`
      : `No, we don't currently have ${other} listed.`;
    return `${here}${p}`;
  }

  const here =
    input.currentListingInStock === false
      ? ""
      : `Oui le ${nick} est tjr dispo, ${ship}. `;
  const p = input.oos
    ? `Par contre ${other} n'est plus dispo pour le moment.`
    : `Par contre je n'ai pas ${other} en stock actuellement.`;
  return `${here}${p}`;
}

/**
 * Build / enrich availability reply using seller-wide catalog hits.
 */
export function buildCatalogAvailabilityReply(input: {
  message: string;
  askedLabel?: string | null;
  hits: CatalogHit[];
  extraParts?: string[];
  foreignProductAsk?: boolean;
  currentListingTitle?: string | null;
  /** Conversation listing still has stock (default true if unknown). */
  currentListingInStock?: boolean;
  currentListingBody?: string | null;
  currentAnswerability?: ListingAnswerability;
  languageCode?: string;
  signature?: string;
}): CatalogReplyResult {
  const signals: string[] = [`catalog_hits=${input.hits.length}`];
  const inStock = input.hits.filter((h) => {
    if (typeof h.matchedVariationQty === "number") {
      return h.matchedVariationQty > 0;
    }
    return h.quantityAvailable > 0;
  });

  const label = input.askedLabel?.trim() || "cet article";
  const extras = (input.extraParts ?? []).filter((p) => p.trim());
  const inStockHere = input.currentListingInStock !== false;
  const joinSameListing = (main: string) =>
    [...(main ? [main] : []), ...extras].filter(Boolean).join(" ");

  if (input.foreignProductAsk) {
    if (inStock.length >= 1) {
      const hit = inStock[0]!;
      signals.push(`catalog_item=${hit.itemId}`, `catalog_foreign=1`);
      const body =
        inStock.length === 1
          ? formatForeignYes({
              hit,
              label,
              shippingParts: extras,
              currentListingTitle: input.currentListingTitle,
              currentListingInStock: inStockHere,
              languageCode: input.languageCode,
            })
          : formatForeignMulti({
              hits: inStock,
              label,
              shippingParts: extras,
              currentListingTitle: input.currentListingTitle,
              currentListingInStock: inStockHere,
              languageCode: input.languageCode,
            });
      return {
        reply: wrapReply(body, input.languageCode, input.signature),
        answerability: "direct_yes",
        signals,
      };
    }
    signals.push(
      input.hits.length > 0 ? "catalog_oos" : "catalog_not_found",
      "catalog_foreign=1",
    );
    return {
      reply: wrapReply(
        formatForeignNo({
          label,
          shippingParts: extras,
          oos: input.hits.length > 0,
          currentListingTitle: input.currentListingTitle,
          currentListingInStock: inStockHere,
          languageCode: input.languageCode,
        }),
        input.languageCode,
        input.signature,
      ),
      answerability: "direct_no",
      signals,
    };
  }

  if (inStock.length === 1) {
    const hit = inStock[0]!;
    const variant =
      hit.matchedVariationLabel != null
        ? `${hit.matchedVariationLabel}`
        : casualCatalogLabel(hit.title || label, label);
    const qty = hit.matchedVariationQty ?? hit.quantityAvailable;
    signals.push(`catalog_item=${hit.itemId}`, `catalog_qty=${qty}`);
    return {
      reply: wrapReply(
        joinSameListing(`Oui, ${variant} est tjr dispo : ${hit.itemUrl}`),
        input.languageCode,
        input.signature,
      ),
      answerability: "direct_yes",
      signals,
    };
  }

  if (inStock.length > 1) {
    const hit = inStock[0]!;
    signals.push(`catalog_ambiguous=${inStock.length}`);
    return {
      reply: wrapReply(
        joinSameListing(
          `Oui on a ça en stock, voici le lien : ${hit.itemUrl}`,
        ),
        input.languageCode,
        input.signature,
      ),
      answerability: "direct_yes",
      signals,
    };
  }

  if (input.hits.length > 0) {
    signals.push("catalog_oos");
    return {
      reply: wrapReply(
        joinSameListing(`Non, ${label} n'est plus dispo pour le moment.`),
        input.languageCode,
        input.signature,
      ),
      answerability: "direct_no",
      signals,
    };
  }

  if (input.currentListingBody?.trim()) {
    return {
      reply: wrapReply(
        joinSameListing(input.currentListingBody.trim()),
        input.languageCode,
        input.signature,
      ),
      answerability: input.currentAnswerability ?? "direct_no",
      signals: [...signals, "catalog_no_stock"],
    };
  }

  return {
    reply: null,
    answerability: "unknown",
    signals,
  };
}

export function stripReplyEnvelope(reply: string): string {
  return reply
    .replace(/^Bonjour,\s*/i, "")
    .replace(/^Hi,\s*/i, "")
    .replace(/\n\nCordialement,?\s*(?:\nSNOWOLF)?\s*$/i, "")
    .replace(/\n\nBest regards,?\s*$/i, "")
    .trim();
}
