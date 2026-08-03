import type { AuthProvider } from "./types";

export type ProviderAvailability = {
  provider: AuthProvider;
  label: string;
  description: string;
  enabled: boolean;
};

/** Email magic link is the primary app login; Google later; eBay is a linked API account. */
export const AUTH_PROVIDERS: ProviderAvailability[] = [
  {
    provider: "email",
    label: "Continuer avec e-mail",
    description: "Lien magique Supabase (recommandé)",
    enabled: true,
  },
  {
    provider: "google",
    label: "Continuer avec Google",
    description: "Disponible après configuration OAuth Google",
    enabled: false,
  },
  {
    provider: "ebay",
    label: "Connecter eBay",
    description: "Après login — Paramètres → Connexions (API vendeur)",
    enabled: false,
  },
];
