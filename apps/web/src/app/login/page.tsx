import Link from "next/link";
import { AUTH_PROVIDERS } from "@/auth/config";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { LoginForm } from "@/features/auth/login-form";
import { isSupabaseAuthConfigured } from "@/lib/supabase/env";
import { ensureServerEnv } from "@/server/env";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  ensureServerEnv();
  const params = searchParams ? await searchParams : {};
  const configured = isSupabaseAuthConfigured();
  const nextPath = params.next || "/dashboard";

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-xs font-bold text-accent-fg">
            EA
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            Connexion
          </h1>
          <p className="mt-1 text-sm text-muted">
            Compte application via e-mail. eBay se connecte ensuite dans
            Paramètres.
          </p>
        </div>

        <Card>
          <CardHeader
            title="E-mail"
            description={
              configured
                ? "Recevez un lien magique (pas de mot de passe)."
                : "Supabase Auth non configuré — mode développement possible."
            }
          />
          <CardBody>
            <LoginForm configured={configured} nextPath={nextPath} />
            {params.error ? (
              <p className="mt-3 text-xs text-danger">
                Échec de connexion ({params.error}).
              </p>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Autres options" description="Activation progressive" />
          <CardBody className="space-y-2">
            {AUTH_PROVIDERS.filter((p) => p.provider !== "email").map(
              (provider) => (
                <button
                  key={provider.provider}
                  type="button"
                  disabled={!provider.enabled}
                  className="flex w-full flex-col rounded-lg border border-border px-3 py-3 text-left transition-colors enabled:hover:bg-muted-bg disabled:cursor-not-allowed disabled:opacity-55"
                >
                  <span className="text-sm font-medium text-foreground">
                    {provider.label}
                  </span>
                  <span className="text-xs text-muted">
                    {provider.description}
                  </span>
                </button>
              ),
            )}
          </CardBody>
        </Card>

        {!configured ? (
          <div className="text-center text-sm">
            <Link
              href="/dashboard"
              className="font-medium text-foreground underline-offset-2 hover:underline"
            >
              Continuer sans compte (dev / token .env)
            </Link>
          </div>
        ) : null}
      </div>
    </div>
  );
}
