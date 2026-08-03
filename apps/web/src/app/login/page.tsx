import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { isAuthSkipped } from "@/lib/auth-mode";
import { ensureServerEnv } from "@/server/env";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ next?: string; error?: string }>;
};

export default async function LoginPage({ searchParams }: Props) {
  ensureServerEnv();
  const params = searchParams ? await searchParams : {};
  const nextPath = params.next || "/dashboard";
  const skipAuth = isAuthSkipped();

  return (
    <div className="flex min-h-full items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg bg-accent text-xs font-bold text-accent-fg">
            EA
          </div>
          <h1 className="mt-4 text-xl font-semibold tracking-tight">
            eBay AI
          </h1>
          <p className="mt-1 text-sm text-muted">
            {skipAuth
              ? "Mode test — pas de login e-mail / Google."
              : "Connexion application"}
          </p>
        </div>

        <Card>
          <CardHeader
            title="Accès rapide"
            description={
              skipAuth
                ? "Entre directement dans l’app. Connecte eBay ensuite si besoin (ou token .env)."
                : "Auth activée — configure SKIP_AUTH=true pour tester sans login."
            }
          />
          <CardBody className="space-y-3">
            <Link href={nextPath} className="block">
              <Button type="button" variant="primary" className="w-full">
                Entrer dans l’app
              </Button>
            </Link>
            {params.error ? (
              <p className="text-xs text-danger">
                Échec ({params.error}).
              </p>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
