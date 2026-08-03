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
];

const ENGLISH_HINTS = [
  "hello",
  "hi",
  "thanks",
  "please",
  "shipping",
  "delivery",
  "return",
  "order",
  "price",
  "compatible",
  "working",
  "does it",
  "can you",
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
  "compatible",
];

function countHints(text: string, hints: string[]): number {
  return hints.reduce((acc, hint) => (text.includes(hint) ? acc + 1 : acc), 0);
}

/**
 * Lightweight language detection for seller messaging.
 * Prefer script detection for Arabic, then keyword scoring.
 * No external API call (keeps latency/cost low; ready to swap later).
 */
export function detectLanguage(text: string | undefined): DetectedLanguage {
  const raw = text?.trim() ?? "";
  if (!raw) {
    return { code: "unknown", label: "inconnue", confidence: "low" };
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
  const frenchCue = /[àâäéèêëïîôùûüçœ]|\b(je|vous|nous|des|une|les)\b/i.test(raw)
    ? 1
    : 0;

  const scores = [
    { code: "fr" as const, label: "français", score: fr + frenchCue },
    { code: "en" as const, label: "anglais", score: en },
    { code: "es" as const, label: "espagnol", score: es },
  ].sort((a, b) => b.score - a.score);

  const best = scores[0]!;
  const second = scores[1]!;

  if (best.score === 0) {
    return { code: "unknown", label: "inconnue", confidence: "low" };
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
