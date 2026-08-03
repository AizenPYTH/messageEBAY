import type { ListingDetails } from "../ebay/tradingApi.js";
import type { ClosedQuestionTopic, ListingAnswerability, ResponsePlan } from "./types.js";

type TopicDetection = {
  topic: ClosedQuestionTopic;
  label: string;
};

const TOPIC_PATTERNS: Array<{ topic: ClosedQuestionTopic; label: string; patterns: RegExp[] }> = [
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
    topic: "available",
    label: "disponibilité",
    patterns: [
      /\bdisponible\b/i,
      /\btoujours\s+(en\s+vente|là|dispo|disponible)\b/i,
      /\bstill\s+available\b/i,
      /\bin\s+stock\b/i,
      /\bstock\b/i,
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
    patterns: [/\bcompatible\b/i],
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
    label: "envoi rapide",
    patterns: [/\benvoi\s+rapide\b/i, /\blivraison\s+rapide\b/i, /\bfast\s+ship/i],
  },
];

function listingCorpus(listing: ListingDetails | undefined): string {
  if (!listing) return "";
  const specifics = listing.itemSpecifics
    .map((s) => `${s.name} ${s.value}`)
    .join(" ");
  return [
    listing.title,
    listing.condition,
    listing.listingStatus,
    listing.quantity,
    listing.descriptionText,
    specifics,
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

function hasAny(corpus: string, patterns: RegExp[]): string | undefined {
  for (const re of patterns) {
    const m = corpus.match(re);
    if (m?.[0]) return m[0];
  }
  return undefined;
}

function evaluateTopicAgainstListing(
  topic: ClosedQuestionTopic,
  listing: ListingDetails | undefined,
): { answerability: ListingAnswerability; signals: string[]; suggestedReply?: string } {
  const corpus = listingCorpus(listing);
  const signals: string[] = [];

  if (topic === "available") {
    const status = listing?.listingStatus?.toLowerCase() ?? "";
    const qty = Number(listing?.quantity ?? NaN);
    if (status === "active" || (Number.isFinite(qty) && qty > 0)) {
      if (listing?.listingStatus) signals.push(`statut=${listing.listingStatus}`);
      if (listing?.quantity) signals.push(`quantité=${listing.quantity}`);
      return {
        answerability: "direct_yes",
        signals,
        suggestedReply: "Oui, l'article est toujours disponible.",
      };
    }
    if (status && status !== "active") {
      signals.push(`statut=${listing?.listingStatus}`);
      return {
        answerability: "direct_no",
        signals,
        suggestedReply: "Non, l'article n'est plus disponible.",
      };
    }
    return { answerability: "unknown", signals };
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
      // Selling as new/refurbished/used (unless for parts) implies the seller presents the item as working.
      const negative = hasAny(corpus, [
        /\bpour\s+pi[èe]ces\b/i,
        /\bnot\s+working\b/i,
        /\bhs\b/i,
        /\ben\s+panne\b/i,
        /\bd[ée]fectueux\b/i,
        /\bfor\s+parts\b/i,
      ]);
      if (negative) {
        signals.push(`signal_negatif=${negative}`);
        return {
          answerability: "direct_no",
          signals,
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
    if (listing?.condition?.trim()) {
      signals.push(`état=${listing.condition}`);
      return {
        answerability: "direct_yes",
        signals,
        suggestedReply: `Oui, il est en bon état, conformément à l'annonce.`,
      };
    }
    const hit = hasAny(corpus, [/\bbon\s+[ée]tat\b/i, /\bneuv[ea]\b/i, /\breconditionn/i]);
    if (hit) {
      signals.push(`signal=${hit}`);
      return {
        answerability: "direct_yes",
        signals,
        suggestedReply: "Oui, il est en bon état, conformément à l'annonce.",
      };
    }
    return { answerability: "unknown", signals };
  }

  if (topic === "battery_original") {
    const hit = hasAny(corpus, [
      /\bbatterie\s+d['’]?origine\b/i,
      /\boriginal\s+battery\b/i,
      /\bbattery\s+health\b/i,
      /\bcycles?\b/i,
    ]);
    if (hit) {
      signals.push(`signal=${hit}`);
      return {
        answerability: "direct_yes",
        signals,
        suggestedReply: "Oui, selon l'annonce, la batterie est d'origine.",
      };
    }
    return { answerability: "unknown", signals };
  }

  if (topic === "charger_included") {
    const yes = hasAny(corpus, [
      /\bchargeur\s+(fourni|inclus)\b/i,
      /\bwith\s+charger\b/i,
      /\bcharger\s+included\b/i,
    ]);
    const no = hasAny(corpus, [
      /\bsans\s+chargeur\b/i,
      /\bno\s+charger\b/i,
      /\bchargeur\s+non\s+fourni\b/i,
    ]);
    if (no) {
      signals.push(`signal=${no}`);
      return {
        answerability: "direct_no",
        signals,
        suggestedReply: "Non, le chargeur n'est pas fourni.",
      };
    }
    if (yes) {
      signals.push(`signal=${yes}`);
      return {
        answerability: "direct_yes",
        signals,
        suggestedReply: "Oui, le chargeur est fourni.",
      };
    }
    return { answerability: "unknown", signals };
  }

  if (topic === "keyboard_layout") {
    const azerty = hasAny(corpus, [/\bazerty\b/i]);
    const qwerty = hasAny(corpus, [/\bqwerty\b/i]);
    if (azerty) {
      signals.push(`signal=${azerty}`);
      return {
        answerability: "direct_yes",
        signals,
        suggestedReply: "Oui, le clavier est AZERTY.",
      };
    }
    if (qwerty) {
      signals.push(`signal=${qwerty}`);
      return {
        answerability: "direct_no",
        signals,
        suggestedReply: "Non, le clavier n'est pas AZERTY (QWERTY selon l'annonce).",
      };
    }
    return { answerability: "unknown", signals };
  }

  if (topic === "unlocked") {
    const yes = hasAny(corpus, [/\bd[ée]bloqu[ée]\b/i, /\bunlocked\b/i]);
    const no = hasAny(corpus, [/\bbleckt\b/i, /\bsim\s+lock/i, /\boperator\s+locked\b/i]);
    if (no) {
      signals.push(`signal=${no}`);
      return {
        answerability: "direct_no",
        signals,
        suggestedReply: "Non, l'appareil n'est pas indiqué comme débloqué.",
      };
    }
    if (yes) {
      signals.push(`signal=${yes}`);
      return {
        answerability: "direct_yes",
        signals,
        suggestedReply: "Oui, il est débloqué.",
      };
    }
    return { answerability: "unknown", signals };
  }

  if (topic === "fast_shipping") {
    const dispatch = listing?.dispatchTimeMax;
    if (dispatch === "0" || dispatch === "1") {
      signals.push(`DispatchTimeMax=${dispatch}`);
      return {
        answerability: "direct_yes",
        signals,
        suggestedReply: "Oui, l'envoi est rapide selon les délais indiqués.",
      };
    }
    return { answerability: "unknown", signals };
  }

  if (topic === "firm_price") {
    // Default seller stance often "firm" is policy — without explicit listing text, unknown.
    return { answerability: "unknown", signals };
  }

  if (topic === "compatible") {
    // Compatibility usually needs model match — don't auto-yes from generic listing.
    return { answerability: "unknown", signals };
  }

  return { answerability: "unknown", signals };
}

/**
 * Enrich a response plan using listing evidence for short closed questions.
 */
export function enrichResponsePlanWithListing(
  plan: ResponsePlan,
  message: string | undefined,
  listing: ListingDetails | undefined,
): ResponsePlan {
  if (plan.intent !== "closed_question" && !plan.isSimpleQuestion) {
    return plan;
  }

  const detected = detectClosedQuestionTopic(message);
  if (!detected) {
    return {
      ...plan,
      closedQuestionTopic: "other_closed",
      listingAnswerability: "unknown",
      listingEvidence: [],
      reasons: [...plan.reasons, "question fermée sans topic reconnu"],
    };
  }

  const evaluation = evaluateTopicAgainstListing(detected.topic, listing);
  const reasons = [
    ...plan.reasons,
    `topic=${detected.label}`,
    `answerability=${evaluation.answerability}`,
    ...evaluation.signals.map((s) => `evidence:${s}`),
  ];

  const enriched: ResponsePlan = {
    ...plan,
    closedQuestionTopic: detected.topic,
    listingAnswerability: evaluation.answerability,
    listingEvidence: evaluation.signals,
    reasons,
  };
  if (evaluation.suggestedReply) {
    enriched.suggestedDirectReply = evaluation.suggestedReply;
  }
  return enriched;
}
