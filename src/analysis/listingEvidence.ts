import type { ListingDetails, ListingVariation } from "../ebay/tradingApi.js";
import {
  SAME_DAY_BEFORE_15,
  shippingPhraseFromDispatch,
} from "../seller/casualPhrases.js";
import { formatShippingDelayReply } from "../shipping/deliveryEta.js";
import {
  listingIsAftermarketPart,
  listingIsGradeA,
} from "./sellerOps.js";
import type {
  ClosedQuestionTopic,
  ListingAnswerability,
  ResponsePlan,
} from "./types.js";

type TopicDetection = {
  topic: ClosedQuestionTopic;
  label: string;
};

const TOPIC_PATTERNS: Array<{
  topic: ClosedQuestionTopic;
  label: string;
  patterns: RegExp[];
}> = [
  {
    topic: "functional",
    label: "fonctionnel / ça marche",
    patterns: [
      /\bfonctionnel(le)?\b/i,
      /\b[cç]a\s+marche\b/i,
      /\bmarche\s*\?/i,
      /\bworking\b/i,
      /\bworks\b/i,
    ],
  },
  {
    topic: "oem_generic",
    label: "générique / original Apple",
    patterns: [
      /\bg[ée]n[ée]rique\b/i,
      /\bgeneric\b/i,
      /\boem\b/i,
      /\bofficiel(?:le)?\b/i,
      /\boriginal(?:e)?\s+apple\b/i,
      /\bapple\s+original(?:e)?\b/i,
      /\bpi[eè]ce\s+originale?\b/i,
      /\bpas\s+(un\s+)?(?:produit\s+)?(?:officiel|original)/i,
    ],
  },
  {
    topic: "available",
    label: "disponibilité",
    patterns: [
      /\bdisponible\b/i,
      /\bdispos?\b/i,
      /\btoujours\s+(en\s+vente|là|dispo|disponible)\b/i,
      /\bstill\s+available\b/i,
      /\bin\s+stock\b/i,
      /\bstock\b/i,
      /\bavez[- ]vous\b/i,
      /\bauriez[- ]vous\b/i,
      /\bun autre\b/i,
      /\bvous\s+avez\b/i,
      /\by\s+a[- ]t[- ]il\b/i,
      /\ben\s+avez[- ]vous\b/i,
      /\ben\s+(rouge|bleu|vert|noir|blanc|gris|argent|dor[ée]|gold|silver|black|white|red|blue|green|rose|pink|jaune|yellow)\b/i,
    ],
  },
  {
    topic: "condition",
    label: "état",
    patterns: [
      /\b(en\s+)?bon\s+[ée]tat\b/i,
      /\b[ée]tat\b/i,
      /\bcondition\b/i,
      /\bneuf\b/i,
      /\bnew\b/i,
      /\bgrade\s*[ab]\b/i,
    ],
  },
  {
    topic: "battery_original",
    label: "batterie d'origine",
    patterns: [/\bbatterie\b/i, /\boriginal\s+battery\b/i, /\borigine\b/i],
  },
  {
    topic: "charger_included",
    label: "chargeur fourni",
    patterns: [/\bchargeur\b/i, /\bcharger\b/i],
  },
  {
    topic: "keyboard_layout",
    label: "clavier AZERTY/QWERTY",
    patterns: [/\bazerty\b/i, /\bqwerty\b/i, /\bclavier\b/i],
  },
  {
    topic: "compatible",
    label: "compatibilité",
    patterns: [
      /\bcompatible\b/i,
      /\bcompatibilit/i,
      /\bmarche\s+(partout|avec|sur)\b/i,
      /\bfonctionne\s+(partout|avec|sur)\b/i,
    ],
  },
  {
    topic: "unlocked",
    label: "débloqué",
    patterns: [/\bd[ée]bloqu[ée]\b/i, /\bunlocked\b/i],
  },
  {
    topic: "firm_price",
    label: "prix ferme",
    patterns: [/\bprix\s*ferme\b/i, /\bfirm\s+price\b/i],
  },
  {
    topic: "fast_shipping",
    label: "envoi / livraison / délais",
    patterns: [
      /\benvoi\s+rapide\b/i,
      /\blivraison\s+rapide\b/i,
      /\bfast\s+ship/i,
      /\bd[ée]lai\s+d['’]?exp[ée]dition\b/i,
      /\bd[ée]lai\s+de\s+livraison\b/i,
      /\btemps\s+de\s+livraison\b/i,
      /\bquand\s+(partez|exp[ée]diez|envoyez)\b/i,
      /\bcombien\s+de\s+temps\b.{0,40}\b(livr|exp[ée]d|envoi)\b/i,
      /\bshipping\s+time\b/i,
      /\bdispatch\b/i,
      /\blivraison\b/i,
      /\bexp[ée]dition\b/i,
    ],
  },
];

function listingCorpus(listing: ListingDetails | undefined): string {
  if (!listing) return "";
  const specifics = listing.itemSpecifics
    .map((s) => `${s.name} ${s.value}`)
    .join(" ");
  const variations = (listing.variations ?? [])
    .flatMap((v) => v.specifics.map((s) => `${s.name} ${s.value}`))
    .join(" ");
  return [
    listing.title,
    listing.condition,
    listing.listingStatus,
    listing.quantity,
    listing.descriptionText,
    specifics,
    variations,
  ]
    .filter(Boolean)
    .join(" \n ");
}

export function detectClosedQuestionTopic(
  message: string | undefined,
): TopicDetection | null {
  const text = message?.trim() ?? "";
  if (!text) return null;
  for (const item of TOPIC_PATTERNS) {
    if (item.patterns.some((re) => re.test(text))) {
      return { topic: item.topic, label: item.label };
    }
  }
  return null;
}

/** All listing topics present in one buyer message (stock + shipping…). */
export function detectAllListingTopics(
  message: string | undefined,
): ClosedQuestionTopic[] {
  const text = message?.trim() ?? "";
  if (!text) return [];
  const found: ClosedQuestionTopic[] = [];
  for (const item of TOPIC_PATTERNS) {
    if (item.patterns.some((re) => re.test(text))) {
      found.push(item.topic);
    }
  }
  // Specific model ask counts as availability even without "dispo".
  if (
    !found.includes("available") &&
    extractAskedModelLabel(text)
  ) {
    found.unshift("available");
  }
  return found;
}

function hasAny(corpus: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = corpus.match(re);
    if (m?.[0]) return m[0];
  }
  return undefined;
}

function normalizeToken(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function formatVariationLabel(v: ListingVariation): string {
  const specs = v.specifics.map((s) => s.value).filter(Boolean).join(" / ");
  return specs || v.sku || "variante";
}

/** "Surface Pro 8", "Pro 8", "iPhone 12", … */
export function extractAskedModelLabel(message: string): string | null {
  const raw = message.trim();
  const surface = raw.match(/\bsurface\s*pro\s*(\d+)\b/i);
  if (surface) return `Surface Pro ${surface[1]}`;
  const pro = raw.match(/\bpro\s*(\d+)\b/i);
  if (pro && /\b(écran|ecran|surface|microsoft)\b/i.test(raw)) {
    return `Surface Pro ${pro[1]}`;
  }
  const iphone = raw.match(/\biphone\s*(\d{1,2}(?:\s*(?:pro|max|plus|mini))?)\b/i);
  if (iphone) return `iPhone ${iphone[1]}`.replace(/\s+/g, " ");
  const ipad = raw.match(/\bipad\s*(\d+|air|pro|mini)(?:\s*(\d+))?/i);
  if (ipad) return ipad[0].replace(/\s+/g, " ");
  const macbook = raw.match(/\bmacbook\s*(air|pro)?\s*(\d{1,2})?\b/i);
  if (macbook && /\d/.test(macbook[0])) return macbook[0].replace(/\s+/g, " ");
  return null;
}

/**
 * Match buyer text to a listing variation (model / color / size…).
 */
export function matchListingVariation(
  message: string | undefined,
  listing: ListingDetails | undefined,
): ListingVariation | null {
  const text = normalizeToken(message ?? "");
  if (!text || !listing?.variations?.length) return null;

  let best: { variation: ListingVariation; score: number } | null = null;
  const askedModel = extractAskedModelLabel(message ?? "");
  const askedNorm = askedModel ? normalizeToken(askedModel) : "";

  for (const variation of listing.variations) {
    for (const spec of variation.specifics) {
      const value = normalizeToken(spec.value);
      if (value.length < 1) continue;
      let score = 0;
      if (text.includes(value)) score = value.length;
      if (askedNorm && (value.includes(askedNorm) || askedNorm.includes(value))) {
        score = Math.max(score, askedNorm.length + 5);
      }
      // "8" vs "Surface Pro 8"
      const num = askedModel?.match(/(\d+)/)?.[1];
      if (num && (value === num || value.endsWith(` ${num}`) || value.endsWith(num))) {
        score = Math.max(score, 8);
      }
      if (score > 0 && (!best || score > best.score)) {
        best = { variation, score };
      }
    }
  }
  return best?.variation ?? null;
}

/** Title lists several model numbers (multi-model listing). */
export function titleListsMultipleModels(listing: ListingDetails | undefined): boolean {
  const title = listing?.title ?? "";
  const nums = title.match(/\b\d\b/g) ?? [];
  return nums.length >= 3 || /\/\s*\d/.test(title);
}

export function askedUnavailableAttribute(
  message: string | undefined,
  listing: ListingDetails | undefined,
): string | null {
  const raw = message?.trim() ?? "";
  if (!raw || !listing) return null;

  const colorAsk =
    raw.match(
      /\b(rouge|bleu|vert|noir|blanc|gris|argent|dor[ée]|gold|silver|black|white|red|blue|green|rose|pink|jaune|yellow)\b/i,
    )?.[1];
  if (colorAsk) {
    const needle = normalizeToken(colorAsk);
    const corpus = normalizeToken(listingCorpus(listing));
    const inVariations = (listing.variations ?? []).some((v) =>
      v.specifics.some((s) => normalizeToken(s.value).includes(needle)),
    );
    const inSpecifics = listing.itemSpecifics.some((s) =>
      normalizeToken(`${s.name} ${s.value}`).includes(needle),
    );
    if (!corpus.includes(needle) && !inVariations && !inSpecifics) {
      return colorAsk;
    }
  }

  const modelAsk = extractAskedModelLabel(raw);
  if (modelAsk && listing.variations.length > 0) {
    const matched = matchListingVariation(modelAsk, listing);
    if (!matched) return modelAsk;
  }

  return null;
}

function remainingStock(listing: ListingDetails | undefined): number | undefined {
  if (!listing) return undefined;
  if (typeof listing.quantityAvailable === "number") {
    return listing.quantityAvailable;
  }
  const qty = Number(listing.quantity ?? NaN);
  const sold = Number(listing.quantitySold ?? 0);
  if (Number.isFinite(qty)) {
    return Math.max(0, qty - (Number.isFinite(sold) ? sold : 0));
  }
  return undefined;
}

function shippingReply(
  listing: ListingDetails | undefined,
  message?: string,
): string | null {
  const tailored = formatShippingDelayReply({ message, listing });
  if (tailored) return tailored;
  const fromDispatch = shippingPhraseFromDispatch(listing?.dispatchTimeMax);
  if (fromDispatch) return fromDispatch;
  const option = listing?.shippingOptions?.[0];
  if (option?.timeMin || option?.timeMax) {
    return `délai transporteur ${option.timeMin ?? "?"}-${option.timeMax ?? "?"} jours`;
  }
  return SAME_DAY_BEFORE_15;
}

function availabilityReply(
  message: string | undefined,
  listing: ListingDetails | undefined,
): { text: string; answerability: ListingAnswerability; signals: string[] } {
  const signals: string[] = [];
  const matched = matchListingVariation(message, listing);
  const askedModel = extractAskedModelLabel(message ?? "");

  if (matched) {
    const label = formatVariationLabel(matched);
    signals.push(`variante=${label}`, `dispo_variante=${matched.quantityAvailable}`);
    if (matched.quantityAvailable > 0) {
      return {
        answerability: "direct_yes",
        signals,
        text: `Oui, ${label} est disponible.`,
      };
    }
    return {
      answerability: "direct_no",
      signals,
      text: `Non, ${label} n'est plus disponible.`,
    };
  }

  // Buyer asked a specific model on a multi-model listing, but no matching
  // in-stock eBay variation → do NOT say yes to the whole listing.
  if (askedModel) {
    signals.push(`modele_demande=${askedModel}`);
    if ((listing?.variations?.length ?? 0) > 0) {
      return {
        answerability: "direct_no",
        signals,
        text: `Non, ${askedModel} n'est plus disponible.`,
      };
    }
    if (titleListsMultipleModels(listing)) {
      // No per-SKU stock in eBay — never invent "oui" for one model.
      return {
        answerability: "direct_no",
        signals: [...signals, "annonce_multi_modeles_sans_variantes"],
        text: `Non, ${askedModel} n'est plus disponible sur cette annonce.`,
      };
    }
  }

  const missing = askedUnavailableAttribute(message, listing);
  if (missing) {
    signals.push(`attribut_absent=${missing}`);
    return {
      answerability: "direct_no",
      signals,
      text: `Non, cette annonce ne propose pas « ${missing} ».`,
    };
  }

  const status = listing?.listingStatus?.toLowerCase() ?? "";
  const available = remainingStock(listing);
  if (status === "active" && available !== undefined && available > 0) {
    signals.push(`dispo=${available}`);
    return {
      answerability: "direct_yes",
      signals,
      text: "Oui, l'article est tjr dispo.",
    };
  }
  if (status && status !== "active") {
    return {
      answerability: "direct_no",
      signals: [`statut=${listing?.listingStatus}`],
      text: "Non, l'article n'est plus disponible.",
    };
  }
  if (available === 0) {
    return {
      answerability: "direct_no",
      signals: ["dispo=0"],
      text: "Non, il n'y a plus de stock sur cette annonce.",
    };
  }
  if (status === "active") {
    return {
      answerability: "direct_yes",
      signals: ["statut=Active"],
      text: "Oui, l'article est tjr dispo.",
    };
  }
  return {
    answerability: "unknown",
    signals,
    text: "",
  };
}

/**
 * Compatibility ask — never answer with stock/disponibilité.
 * Hard yes/no only when the listing is explicit; nuanced asks → LLM.
 */
function compatibilityReply(
  message: string | undefined,
  listing: ListingDetails | undefined,
): { text: string; answerability: ListingAnswerability; signals: string[] } {
  const signals: string[] = ["topic=compatible"];
  const corpus = listingCorpus(listing);
  const raw = message?.trim() ?? "";

  if (!listing || !corpus.trim()) {
    return { answerability: "unknown", signals, text: "" };
  }

  // Explicit incompatibility in listing
  if (
    /\bnon\s+compatible\b/i.test(corpus) ||
    /\bincompatible\b/i.test(corpus)
  ) {
    return {
      answerability: "direct_no",
      signals: [...signals, "listing=incompatible"],
      text: "Non, ce n'est pas compatible d'après l'annonce.",
    };
  }

  // Nuanced asks (partout / everywhere / vague) → let the LLM reason with facts.
  if (
    /\bpartout\b/i.test(raw) ||
    /\beverywhere\b/i.test(raw) ||
    /\b(tous|toutes)\s+les\s+(pays|réseaux|reseaux|op[ée]rateurs)\b/i.test(raw)
  ) {
    return {
      answerability: "unknown",
      signals: [...signals, "compatible_nuance_llm"],
      text: "",
    };
  }

  // Soft yes only if listing explicitly talks about compatibility.
  if (hasAny(corpus, [/\bcompatible\b/i, /\bcompatibilit/i])) {
    return {
      answerability: "direct_yes",
      signals: [...signals, "listing=compatible_mention"],
      text: "Oui, c'est indiqué compatible sur l'annonce.",
    };
  }

  // Brand/operator in title is a useful fact for the LLM, not a canned line.
  return {
    answerability: "unknown",
    signals: [...signals, "compatible_to_llm"],
    text: "",
  };
}

/**
 * Build a factual reply covering ALL listing asks in one message
 * (ex: stock modèle + délai livraison).
 */
export function buildListingFactualReply(input: {
  message: string | undefined;
  listing: ListingDetails | undefined;
  languageCode?: string;
  signature?: string;
  /** Skip stock answer for this listing (buyer asked another product). */
  skipAvailability?: boolean;
}): {
  reply: string | null;
  topics: ClosedQuestionTopic[];
  answerability: ListingAnswerability;
  signals: string[];
  /** Shipping sentence alone, when present. */
  shippingText: string | null;
} {
  const topics = detectAllListingTopics(input.message);
  if (topics.length === 0) {
    return {
      reply: null,
      topics: [],
      answerability: "unknown",
      signals: [],
      shippingText: null,
    };
  }

  const parts: string[] = [];
  const signals: string[] = [];
  let answerability: ListingAnswerability = "unknown";
  let shippingText: string | null = null;

  if (!input.skipAvailability && topics.includes("available")) {
    const avail = availabilityReply(input.message, input.listing);
    if (avail.text) {
      parts.push(avail.text);
      signals.push(...avail.signals);
      answerability = avail.answerability;
    }
  } else if (input.skipAvailability && topics.includes("available")) {
    signals.push("availability_deferred_to_catalog");
  }

  if (topics.includes("compatible")) {
    const compat = compatibilityReply(input.message, input.listing);
    signals.push(...compat.signals);
    // Only hard no/yes with explicit listing wording — nuances go to the LLM.
    if (
      compat.text &&
      (compat.answerability === "direct_no" ||
        (compat.answerability === "direct_yes" &&
          compat.signals.includes("listing=compatible_mention")))
    ) {
      parts.push(compat.text);
      if (answerability === "unknown") answerability = compat.answerability;
      else if (compat.answerability === "direct_no") answerability = "direct_no";
    }
  }

  if (topics.includes("fast_shipping")) {
    const ship = shippingReply(input.listing, input.message);
    if (ship) {
      shippingText = ship;
      parts.push(ship);
      signals.push("shipping_answered");
      if (answerability === "unknown") answerability = "direct_yes";
    }
  }

  // Other single topics (functional, etc.) — keep previous evaluate path via enrich.
  const onlyOther =
    parts.length === 0 &&
    topics.some((t) => t !== "available" && t !== "fast_shipping" && t !== "compatible");
  if (onlyOther) {
    return {
      reply: null,
      topics,
      answerability: "unknown",
      signals,
      shippingText,
    };
  }

  if (parts.length === 0) {
    return { reply: null, topics, answerability, signals, shippingText };
  }

  const sig = input.signature?.trim() || "Cordialement,\nSNOWOLF";
  const body = parts.join(" ");
  const reply =
    input.languageCode === "en"
      ? `Hi,\n\n${body}\n\n${sig}`
      : `Bonjour,\n\n${body}\n\n${sig}`;

  return { reply, topics, answerability, signals, shippingText };
}

function evaluateTopicAgainstListing(
  topic: ClosedQuestionTopic,
  listing: ListingDetails | undefined,
  message?: string,
): {
  answerability: ListingAnswerability;
  signals: string[];
  suggestedReply?: string;
} {
  const corpus = listingCorpus(listing);
  const signals: string[] = [];

  if (topic === "available") {
    const avail = availabilityReply(message, listing);
    return {
      answerability: avail.answerability,
      signals: avail.signals,
      ...(avail.text ? { suggestedReply: avail.text } : {}),
    };
  }

  if (topic === "compatible") {
    const compat = compatibilityReply(message, listing);
    return {
      answerability: compat.answerability,
      signals: compat.signals,
      ...(compat.text ? { suggestedReply: compat.text } : {}),
    };
  }

  if (topic === "oem_generic") {
    const aftermarket = listingIsAftermarketPart(corpus);
    const gradeA = listingIsGradeA(corpus);
    if (aftermarket) {
      const bits = [
        "Générique = pas une pièce originale Apple, très bonne qualité, ça marche.",
      ];
      if (gradeA) bits.push("Grade A = excellent état, fonctionnel.");
      return {
        answerability: "direct_yes",
        signals: ["listing=generique", ...(gradeA ? ["listing=grade_a"] : [])],
        suggestedReply: bits.join(" "),
      };
    }
    return { answerability: "unknown", signals: ["oem_generic_to_llm"] };
  }

  if (topic === "functional") {
    const hit =
      hasAny(corpus, [
        /\bfonctionnel(le)?s?\b/i,
        /\btest[ée]e?\b/i,
        /\b100\s*%\s*fonctionnel/i,
        /\bworking\b/i,
        /\bfully\s+tested\b/i,
        /\bsans\s+d[ée]faut\b/i,
        /\bneuf(ve)?\b/i,
        /\bneuv[ea]\b/i,
        /\bnew\b/i,
        /\breconditionn[ée]\b/i,
        /\brefurbish/i,
        /\bgrade\s*a\b/i,
        /\bg[ée]n[ée]rique\b/i,
      ]) ||
      (listing?.condition
        ? hasAny(listing.condition, [
            /neuf/i,
            /new/i,
            /reconditionn/i,
            /refurbish/i,
            /bon\s+[ée]tat/i,
            /seller\s+refurbished/i,
            /occasion/i,
            /used/i,
          ])
        : undefined);

    if (hit || listing?.condition) {
      if (hit) signals.push(`signal=${hit}`);
      if (listing?.condition) signals.push(`état=${listing.condition}`);
      const negative = hasAny(corpus, [
        /\bpour\s+pi[èe]ces\b/i,
        /\bnot\s+working\b/i,
        /\bhs\b/i,
        /\ben\s+panne\b/i,
        /\bd[ée]fectueux\b/i,
        /\bfor\s+parts\b/i,
      ]);
      if (negative) {
        return {
          answerability: "direct_no",
          signals: [...signals, `signal_negatif=${negative}`],
          suggestedReply: "Non, l'article n'est pas vendu comme fonctionnel.",
        };
      }
      return {
        answerability: "direct_yes",
        signals,
        suggestedReply: "Oui, elle est bien fonctionnelle.",
      };
    }
    return { answerability: "unknown", signals };
  }

  if (topic === "condition") {
    if (listingIsGradeA(corpus)) {
      return {
        answerability: "direct_yes",
        signals: ["état=Grade A"],
        suggestedReply:
          "Grade A = très bon état de la pièce, fonctionnelle — pas un appareil d'occasion.",
      };
    }
    if (listing?.condition?.trim()) {
      return {
        answerability: "direct_yes",
        signals: [`état=${listing.condition}`],
        suggestedReply: "Oui, il est en bon état, conformément à l'annonce.",
      };
    }
    return { answerability: "unknown", signals };
  }

  if (topic === "battery_original") {
    const hit = hasAny(corpus, [
      /\bbatterie\s+d['’]?origine\b/i,
      /\boriginal\s+battery\b/i,
    ]);
    if (hit) {
      return {
        answerability: "direct_yes",
        signals: [`signal=${hit}`],
        suggestedReply: "Oui, selon l'annonce, la batterie est d'origine.",
      };
    }
    return { answerability: "unknown", signals };
  }

  if (topic === "charger_included") {
    const yes = hasAny(corpus, [
      /\bchargeur\s+(fourni|inclus)\b/i,
      /\bcharger\s+included\b/i,
    ]);
    const no = hasAny(corpus, [/\bsans\s+chargeur\b/i, /\bno\s+charger\b/i]);
    if (no) {
      return {
        answerability: "direct_no",
        signals: [`signal=${no}`],
        suggestedReply: "Non, le chargeur n'est pas fourni.",
      };
    }
    if (yes) {
      return {
        answerability: "direct_yes",
        signals: [`signal=${yes}`],
        suggestedReply: "Oui, le chargeur est fourni.",
      };
    }
    return { answerability: "unknown", signals };
  }

  if (topic === "keyboard_layout") {
    if (hasAny(corpus, [/\bazerty\b/i])) {
      return {
        answerability: "direct_yes",
        signals: ["signal=azerty"],
        suggestedReply: "Oui, le clavier est AZERTY.",
      };
    }
    if (hasAny(corpus, [/\bqwerty\b/i])) {
      return {
        answerability: "direct_no",
        signals: ["signal=qwerty"],
        suggestedReply:
          "Non, le clavier n'est pas AZERTY (QWERTY selon l'annonce).",
      };
    }
    return { answerability: "unknown", signals };
  }

  if (topic === "unlocked") {
    if (hasAny(corpus, [/\bd[ée]bloqu[ée]\b/i, /\bunlocked\b/i])) {
      return {
        answerability: "direct_yes",
        signals: ["signal=unlocked"],
        suggestedReply: "Oui, il est débloqué.",
      };
    }
    return { answerability: "unknown", signals };
  }

  if (topic === "fast_shipping") {
    const ship = shippingReply(listing, message);
    if (ship) {
      return {
        answerability: "direct_yes",
        signals: [`DispatchTimeMax=${listing?.dispatchTimeMax ?? "?"}`],
        suggestedReply: ship,
      };
    }
    return { answerability: "unknown", signals };
  }

  return { answerability: "unknown", signals };
}

export function enrichResponsePlanWithListing(
  plan: ResponsePlan,
  message: string | undefined,
  listing: ListingDetails | undefined,
): ResponsePlan {
  const topics = detectAllListingTopics(message);
  const looksLikeStockAsk =
    topics.includes("available") ||
    Boolean(extractAskedModelLabel(message ?? ""));

  if (
    plan.intent !== "closed_question" &&
    !plan.isSimpleQuestion &&
    topics.length === 0 &&
    !looksLikeStockAsk &&
    !topics.includes("compatible")
  ) {
    return plan;
  }

  // Multi listing asks (stock + shipping) → combined suggested reply.
  if (topics.length >= 2 || (looksLikeStockAsk && topics.includes("fast_shipping"))) {
    const combined = buildListingFactualReply({ message, listing });
    if (combined.reply) {
      return {
        ...plan,
        closedQuestionTopic: topics.includes("available")
          ? "available"
          : topics[0],
        listingAnswerability: combined.answerability,
        listingEvidence: combined.signals,
        suggestedDirectReply: combined.reply
          .replace(/^Bonjour,\s*/i, "")
          .replace(/^Hi,\s*/i, "")
          .replace(/\n\nCordialement,?\s*$/i, "")
          .replace(/\n\nBest regards,?\s*$/i, "")
          .trim(),
        reasons: [
          ...plan.reasons,
          `topics=${topics.join("+")}`,
          `answerability=${combined.answerability}`,
          ...combined.signals.map((s) => `evidence:${s}`),
        ],
        isMultiQuestion: true,
      };
    }
  }

  const detected =
    detectClosedQuestionTopic(message) ??
    (looksLikeStockAsk
      ? { topic: "available" as const, label: "disponibilité / variante" }
      : null);

  if (!detected) {
    return {
      ...plan,
      closedQuestionTopic: "other_closed",
      listingAnswerability: "unknown",
      listingEvidence: [],
      reasons: [...plan.reasons, "question fermée sans topic reconnu"],
    };
  }

  const evaluation = evaluateTopicAgainstListing(
    detected.topic,
    listing,
    message,
  );
  const enriched: ResponsePlan = {
    ...plan,
    closedQuestionTopic: detected.topic,
    listingAnswerability: evaluation.answerability,
    listingEvidence: evaluation.signals,
    reasons: [
      ...plan.reasons,
      `topic=${detected.label}`,
      `answerability=${evaluation.answerability}`,
      ...evaluation.signals.map((s) => `evidence:${s}`),
    ],
  };
  if (evaluation.suggestedReply) {
    enriched.suggestedDirectReply = evaluation.suggestedReply;
  }
  return enriched;
}
