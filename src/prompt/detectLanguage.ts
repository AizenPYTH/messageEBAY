import type { DetectedLanguage } from "./types.js";

const FRENCH_HINTS = [
  "bonjour",
  "bonsoir",
  "merci",
  "svp",
  "s'il",
  "est-ce",
  "avec",
  "pour",
  "commande",
  "livraison",
  "retour",
  "prix",
  "bonjour,",
  "juste",
  "partout",
  "toujours",
  "dispo",
  "disponible",
  "recharger",
  "recharge",
  "fonctionne",
  "fonctionnelle",
  "combien",
  "cout",
  "coût",
  "d'accord",
  "accord",
  "elle",
  "est",
  "pas",
  "oui",
  "non",
];

// Avoid shared words (compatible, return…) — they flip FR→EN wrongly.
const ENGLISH_HINTS = [
  "hello",
  "hi ",
  "thanks",
  "please",
  "shipping",
  "delivery",
  "order",
  "price",
  "working",
  "does it",
  "can you",
  "how much",
  "is it",
  "everywhere",
];

const SPANISH_HINTS = [
  "hola",
  "gracias",
  "por favor",
  "envio",
  "envío",
  "pedido",
  "devolucion",
  "devolución",
  "precio",
  "funciona",
];

function countHints(text: string, hints: string[]): number {
  return hints.reduce((acc, hint) => (text.includes(hint) ? acc + 1 : acc), 0);
}

/**
 * Lightweight language detection for seller messaging.
 * Prefer script detection for Arabic, then keyword scoring.
 * Default to French when unsure (Snowolf sells in FR).
 */
export function detectLanguage(text: string | undefined): DetectedLanguage {
  const raw = text?.trim() ?? "";
  if (!raw) {
    return { code: "fr", label: "français", confidence: "low" };
  }

  if (/[\u0600-\u06FF]/.test(raw)) {
    return { code: "ar", label: "arabe", confidence: "high" };
  }

  const normalized = raw
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

  const fr = countHints(normalized, FRENCH_HINTS);
  const en = countHints(normalized, ENGLISH_HINTS);
  const es = countHints(normalized, SPANISH_HINTS);

  // Accent / common-word cues for French
  const frenchCue = /[àâäéèêëïîôùûüçœ]|\b(je|vous|nous|des|une|les|elle|est|pas|juste)\b/i.test(
    raw,
  )
    ? 2
    : 0;

  const scores = [
    { code: "fr" as const, label: "français", score: fr + frenchCue },
    { code: "en" as const, label: "anglais", score: en },
    { code: "es" as const, label: "espagnol", score: es },
  ].sort((a, b) => b.score - a.score);

  const best = scores[0]!;
  const second = scores[1]!;

  // Seller default: French when no clear signal or tie.
  if (best.score === 0 || best.score === second.score) {
    return { code: "fr", label: "français", confidence: "low" };
  }

  const confidence =
    best.score >= 2 && best.score > second.score
      ? "high"
      : best.score > second.score
        ? "medium"
        : "low";

  return {
    code: best.code,
    label: best.label,
    confidence,
  };
}
