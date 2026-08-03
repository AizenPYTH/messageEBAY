import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getOptionalUser, isAuthEnforced } from "@/server/auth";
import { ensureServerEnv } from "@/server/env";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  ensureServerEnv();
  const enforced = isAuthEnforced();
  const user = await getOptionalUser();

  return (
    <Card>
      <CardHeader
        title="Compte application"
        description="Login e-mail / Google désactivés. Identité navigateur pour lier eBay."
      />
      <CardBody className="space-y-4 text-sm">
        <Badge tone={enforced ? "warning" : "neutral"}>
          {enforced ? "Auth e-mail active" : "Mode sans login (invité / PC)"}
        </Badge>
        {user ? (
          <dl className="space-y-2">
            <div>
              <dt className="text-xs text-muted">Identifiant navigateur</dt>
              <dd className="font-mono text-xs">{user.id}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-muted">
            Cliquez « Connecter eBay » pour créer l’identité de ce PC et lier un
            compte vendeur.
          </p>
        )}
      </CardBody>
    </Card>
  );
}
