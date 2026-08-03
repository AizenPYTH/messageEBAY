import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { hasEnv } from "@/server/env";

export const dynamic = "force-dynamic";

function EnvRow({ name, present }: { name: string; present: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <code className="text-xs text-foreground">{name}</code>
      <Badge tone={present ? "success" : "warning"}>
        {present ? "Présente" : "Absente"}
      </Badge>
    </div>
  );
}

export default function SettingsPage() {
  const rows = [
    "EBAY_CLIENT_ID",
    "EBAY_CLIENT_SECRET",
    "EBAY_RUNAME",
    "EBAY_ENV",
    "EBAY_USER_ACCESS_TOKEN",
    "TOKEN_ENCRYPTION_KEY",
    "OPENAI_API_KEY",
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_APP_URL",
  ].map((name) => ({ name, present: hasEnv(name) }));

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Variables d’environnement"
          description="Secrets serveur uniquement — aucune valeur affichée."
        />
        <CardBody>
          {rows.map((row) => (
            <EnvRow key={row.name} {...row} />
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="RuName eBay"
          description="Redirect OAuth web"
        />
        <CardBody className="space-y-3 text-sm text-muted">
          <p>
            Pointez le RuName vers{" "}
            <code className="text-foreground">
              https://&lt;domaine&gt;/api/ebay/callback
            </code>{" "}
            (et{" "}
            <code className="text-foreground">
              http://localhost:3000/api/ebay/callback
            </code>{" "}
            en local).
          </p>
          <p>
            Les credentials app eBay restent des secrets plateforme. Les tokens
            vendeur sont chiffrés dans{" "}
            <code className="text-foreground">user_connections</code>.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
