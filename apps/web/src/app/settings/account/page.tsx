import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getOptionalUser, isAuthEnforced } from "@/server/auth";
import { ensureServerEnv } from "@/server/env";
import { SignOutButton } from "@/features/auth/sign-out-button";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  ensureServerEnv();
  const enforced = isAuthEnforced();
  const user = await getOptionalUser();

  return (
    <Card>
      <CardHeader
        title="Compte application"
        description="Login e-mail / Google désactivés pour les tests (SKIP_AUTH)."
      />
      <CardBody className="space-y-4 text-sm">
        <div className="flex items-center gap-2">
          <Badge tone={user ? "success" : enforced ? "warning" : "neutral"}>
            {user ? "Connecté" : enforced ? "Non connecté" : "Mode test (sans login)"}
          </Badge>
        </div>
        {user ? (
          <dl className="space-y-2">
            <div>
              <dt className="text-xs text-muted">E-mail</dt>
              <dd>{user.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">User ID</dt>
              <dd className="font-mono text-xs">{user.id}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-muted">
            Pas de compte app pour l’instant — l’API eBay utilise le token
            serveur (.env / Vercel).
          </p>
        )}
        {user ? <SignOutButton /> : null}
      </CardBody>
    </Card>
  );
}
