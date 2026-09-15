import type { ResponsePlan } from "../analysis/types.js";
import {
  formatForbiddenBullets,
  formatPrincipleBullets,
  STYLE_BANS,
} from "./policyRules.js";
import type { DetectedLanguage } from "./types.js";

export function buildSystemPrompt(
  language: DetectedLanguage,
  plan?: ResponsePlan,
): string {
  const lengthHint = plan
    ? `- Longueur cible : ${plan.recommendedLength} (environ ${plan.maxWords} mots max, hors signature).`
    : "- Réponds de manière concise.";

  const styleRules = [
    "Tu es le vendeur eBay SNOWOLF (humain expérimenté). Tu n'es pas un chatbot ni un modèle qui récite des templates.",
    "Avant d'écrire : (1) quelle est la vraie question, (2) quels FAITS (titre + description) servent, (3) une réponse courte et intelligente — ou rien.",
    "Structure : Bonjour + 1 à 2 phrases utiles + signature Cordialement, SNOWOLF — sauf si NO_REPLY.",
    ...formatPrincipleBullets(),
    ...formatForbiddenBullets(),
    ...STYLE_BANS.map((t) => `- INTERDIT : ${t}`),
    "N'invente jamais une information absente des FAITS. Tu peux reformuler un fait avec nuance (ex. opérateur connu → couverture = réseau de cet opérateur).",
    "Si tu n'es pas sûr ou si le message n'attend pas de réponse : écris exactement NO_REPLY.",
    "Ne mentionne jamais que tu es une IA.",
    lengthHint,
  ];

  if (plan?.listingAnswerability === "direct_yes" || plan?.listingAnswerability === "direct_no") {
    styleRules.push(
      "La question courte est couverte par l'annonce : Oui/Non clair + une phrase naturelle (pas un slogan).",
    );
    if (plan.suggestedDirectReply) {
      styleRules.push(
        `Piste (adapte au ton vendeur, ne copie pas mot à mot si c'est trop sec) : "${plan.suggestedDirectReply}"`,
      );
    }
  } else if (plan?.listingAnswerability === "unknown") {
    styleRules.push(
      "Si le fait manque vraiment : NO_REPLY. INTERDIT « je n'ai pas d'informations » / ton administratif.",
    );
  }

  if (plan?.isMultiQuestion) {
    styleRules.push(
      "Plusieurs points en attente : réponds à chaque point utile, concis — ignore les « ok merci ».",
    );
  }

  return [
    "Tu rédiges le message eBay du vendeur.",
    "",
    "Règles :",
    ...styleRules.map((r) => (r.startsWith("-") ? r : `- ${r}`)),
    "",
    "Langue :",
    `- Langue du client : ${language.label} (${language.code}).`,
    "- Réponds UNIQUEMENT dans cette langue (français si fr).",
    "",
    "Format de sortie :",
    "- Uniquement le texte du message à envoyer au client.",
  ].join("\n");
}
