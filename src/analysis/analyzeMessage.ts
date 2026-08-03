import { detectLanguage } from "../prompt/detectLanguage.js";
import type {
  DetailLevel,
  QuestionIntent,
  ResponseLength,
  ResponsePlan,
} from "./types.js";

const SIMPLE_CLOSED_PATTERNS: RegExp[] = [
  /\bfonctionnel(le)?\b/i,
  /\b[cç]a\s+marche\b/i,
  /\bmarche\s*\?/i,
  /\bdisponible\b/i,
  /\btoujours\s+(en\s+vente|là|dispo|disponible)\b/i,
  /\bbatterie\b/i,
  /\bchargeur\b/i,
  /\bazerty\b/i,
  /\bqwerty\b/i,
  /\bcompatible\b/i,
  /\bd[ée]bloqu[ée]\b/i,
  /\b[ée]tat\b/i,
  /\bprix\s*ferme\b/i,
  /\benvoi\s+rapide\b/i,
  /\blivraison\s+rapide\b/i,
  /\bstock\b/i,
  /\bneuf\b/i,
  /\borigine\b/i,
  /\bgaranti[ea]?\b/i,
  /\bavailable\b/i,
  /\bworking\b/i,
  /\boriginal\s+battery\b/i,
  /\bcharger\s+included\b/i,
  /\bunlocked\b/i,
];

const NEGOTIATION_PATTERNS: RegExp[] = [
  /\b(meilleur|dernier)\s+prix\b/i,
  /\brémis[ea]\b/i,
  /\bn[ée]goci/i,
  /\bless\s+expensive\b/i,
  /\bbest\s+price\b/i,
  /\boffer\b/i,
  /\bprix\s*\?/i,
];

const RETURN_PATTERNS: RegExp[] = [
  /\bretour\b/i,
  /\brembours/i,
  /\breturn\b/i,
  /\brefund\b/i,
  /\b[ée]change\b/i,
];

const AFTER_SALES_PATTERNS: RegExp[] = [
  /\b(ne\s+fonctionne|panne|d[ée]fectueux|cass[ée]|sav|apres[-\s]?vente)\b/i,
  /\bnot\s+working\b/i,
  /\bbroken\b/i,
  /\bissue\b/i,
  /\bproblem\b/i,
];

const TECHNICAL_PATTERNS: RegExp[] = [
  /\b(caract[ée]ristique|sp[ée]cification|compar|capacit[ée]|processeur|ram|ssd|go\b|ghz|mod[èe]le|r[ée]f[ée]rence)\b/i,
  /\b(specs?|specification|compare|compatible with|model number)\b/i,
];

const GREETING_PATTERNS: RegExp[] = [
  /^(bonjour|bonsoir|salut|hello|hi|hey|hola)\b/i,
];

const THANKS_PATTERNS: RegExp[] = [
  /^(merci|thanks|thank you|gracias)\b/i,
];

const INTENT_LABELS: Record<QuestionIntent, string> = {
  greeting: "salutation",
  thanks: "remerciement",
  closed_question: "question fermée (oui/non)",
  information_request: "demande d'information",
  technical: "demande technique",
  negotiation: "demande de négociation",
  return_request: "demande de retour/remboursement",
  after_sales: "demande SAV",
  multi_question: "questions multiples",
  other: "autre",
};

function countQuestions(text: string): number {
  const marks = (text.match(/\?/g) ?? []).length;
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const questionLines = lines.filter((l) => /\?$/.test(l) || /^(est-ce|is |does |can |le |la |les )/i.test(l)).length;
  return Math.max(marks, questionLines, text.trim() ? 1 : 0);
}

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

function pickIntent(input: {
  text: string;
  questionCount: number;
  words: number;
}): { intent: QuestionIntent; reasons: string[] } {
  const { text, questionCount, words } = input;
  const reasons: string[] = [];

  if (questionCount >= 2) {
    reasons.push(`${questionCount} questions détectées`);
    return { intent: "multi_question", reasons };
  }

  if (words <= 4 && matchesAny(text, GREETING_PATTERNS) && !text.includes("?")) {
    reasons.push("salutation courte");
    return { intent: "greeting", reasons };
  }

  if (matchesAny(text, THANKS_PATTERNS) && words <= 8 && !text.includes("?")) {
    reasons.push("remerciement");
    return { intent: "thanks", reasons };
  }

  if (matchesAny(text, NEGOTIATION_PATTERNS)) {
    reasons.push("indices de négociation/prix");
    return { intent: "negotiation", reasons };
  }

  if (matchesAny(text, RETURN_PATTERNS)) {
    reasons.push("indices retour/remboursement");
    return { intent: "return_request", reasons };
  }

  if (matchesAny(text, AFTER_SALES_PATTERNS)) {
    reasons.push("indices SAV / panne");
    return { intent: "after_sales", reasons };
  }

  if (matchesAny(text, TECHNICAL_PATTERNS) || words >= 25) {
    reasons.push("demande technique ou message long");
    return { intent: "technical", reasons };
  }

  const simpleClosed =
    matchesAny(text, SIMPLE_CLOSED_PATTERNS) ||
    (words <= 6 && text.includes("?"));

  if (simpleClosed) {
    reasons.push("question courte / fermée");
    return { intent: "closed_question", reasons };
  }

  if (text.includes("?") || /^(est-ce|pouvez|can you|could you)/i.test(text)) {
    reasons.push("demande d'information");
    return { intent: "information_request", reasons };
  }

  reasons.push("intention non classée précisément");
  return { intent: "other", reasons };
}

function planLength(intent: QuestionIntent, isSimple: boolean): {
  recommendedLength: ResponseLength;
  maxWords: number;
  detailLevel: DetailLevel;
  avoidListingRecap: boolean;
  compactListingContext: boolean;
} {
  switch (intent) {
    case "greeting":
    case "thanks":
      return {
        recommendedLength: "very_short",
        maxWords: 30,
        detailLevel: "minimal",
        avoidListingRecap: true,
        compactListingContext: true,
      };
    case "closed_question":
      return {
        recommendedLength: "very_short",
        maxWords: 40,
        detailLevel: "minimal",
        avoidListingRecap: true,
        compactListingContext: true,
      };
    case "negotiation":
    case "return_request":
    case "after_sales":
      return {
        recommendedLength: "short",
        maxWords: 80,
        detailLevel: "focused",
        avoidListingRecap: true,
        compactListingContext: true,
      };
    case "multi_question":
      return {
        recommendedLength: "medium",
        maxWords: 120,
        detailLevel: "focused",
        avoidListingRecap: true,
        compactListingContext: false,
      };
    case "technical":
      return {
        recommendedLength: "long",
        maxWords: 150,
        detailLevel: "detailed",
        avoidListingRecap: false,
        compactListingContext: false,
      };
    case "information_request":
      return {
        recommendedLength: isSimple ? "short" : "medium",
        maxWords: isSimple ? 60 : 110,
        detailLevel: isSimple ? "focused" : "detailed",
        avoidListingRecap: true,
        compactListingContext: isSimple,
      };
    default:
      return {
        recommendedLength: "short",
        maxWords: 80,
        detailLevel: "focused",
        avoidListingRecap: true,
        compactListingContext: true,
      };
  }
}

/**
 * Determines intent + recommended response style before calling GPT.
 * Pure heuristics (no LLM) — fast, testable, cheap.
 */
export function analyzeMessage(text: string | undefined): ResponsePlan {
  const raw = text?.trim() ?? "";
  const language = detectLanguage(raw);
  const words = wordCount(raw);
  const questionCount = raw ? countQuestions(raw) : 0;

  const { intent, reasons } = pickIntent({
    text: raw,
    questionCount,
    words,
  });

  const isSimpleQuestion =
    intent === "closed_question" ||
    (words <= 8 && questionCount === 1) ||
    intent === "greeting" ||
    intent === "thanks";

  const lengthPlan = planLength(intent, isSimpleQuestion);

  return {
    intent,
    intentLabel: INTENT_LABELS[intent],
    isSimpleQuestion,
    isMultiQuestion: intent === "multi_question",
    questionCount,
    recommendedLength: lengthPlan.recommendedLength,
    maxWords: lengthPlan.maxWords,
    detailLevel: lengthPlan.detailLevel,
    avoidListingRecap: lengthPlan.avoidListingRecap,
    compactListingContext: lengthPlan.compactListingContext,
    languageCode: language.code,
    languageLabel: language.label,
    reasons,
  };
}

/** Exported for unit tests. */
export const __test__ = {
  countQuestions,
  wordCount,
  pickIntent,
  planLength,
};
