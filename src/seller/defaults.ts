import type { UpsertSellerProfileInput } from "../database/types.js";

/** Default profile seed — editable later via web UI / CLI. */
export function buildDefaultSellerProfileInput(
  sellerId: string,
  displayName: string,
): UpsertSellerProfileInput {
  return {
    sellerId,
    displayName,
    languages: ["fr", "en"],
    responseStyle:
      "Réponses courtes, claires et professionnelles. Maximum 120 mots.",
    shippingPolicy:
      "Indiquer uniquement les délais confirmés dans l'annonce ou le profil. Ne jamais inventer un délai.",
    returnPolicy:
      "Appliquer strictement la politique de retour de l'annonce / du profil. Ne rien promettre hors cadre.",
    refundPolicy:
      "Aucun remboursement promis sans validation explicite du vendeur.",
    negotiationPolicy:
      "Aucune négociation de prix. Aucune remise sans validation explicite.",
    tone: "vouvoiement",
    signature: "Cordialement,\nSNOWOLF",
    customInstructions: [
      "Tu réponds toujours poliment.",
      "Tu ne négocies jamais les prix.",
      "Tu n'acceptes jamais une remise sans validation.",
      "Tu réponds en moins de 120 mots.",
      "Tu ne fais jamais de promesse non vérifiée.",
      "Tu utilises le vouvoiement.",
      "Tu signes toujours avec la signature du profil.",
    ].join("\n"),
  };
}
