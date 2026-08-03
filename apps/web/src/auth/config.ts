import type { AuthProvider } from "./types";

export type ProviderAvailability = {
  provider: AuthProvider;
  label: string;
  description: string;
  enabled: boolean;
};

/** Auth providers paused while testing (SKIP_AUTH). */
export const AUTH_PROVIDERS: ProviderAvailability[] = [
  {
    provider: "email",
    label: "Continuer avec e-mail",
    description: "Désactivé pour les tests",
    enabled: false,
  },
  {
    provider: "google",
    label: "Continuer avec Google",
    description: "Désactivé pour les tests",
    enabled: false,
  },
];
