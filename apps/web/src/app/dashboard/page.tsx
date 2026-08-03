import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { KpiGrid } from "@/features/dashboard/kpi-grid";
import { ServiceStatusList } from "@/features/dashboard/service-status";
import { getOptionalUser } from "@/server/auth";
import { getCurrentEbayConnection } from "@/server/ebaySession";
import { getDashboardKpis, getServiceHealth } from "@/server/health";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [kpis, services, connection, user] = await Promise.all([
    getDashboardKpis(),
    getServiceHealth(),
    getCurrentEbayConnection(),
    getOptionalUser(),
  ]);

  return (
    <AppShell
      title="Dashboard"
      description="Vue d’ensemble de l’assistant vendeur"
    >
      <div className="space-y-6">
        <Card>
          <CardHeader
            title="Compte eBay"
            description={
              user?.email
                ? `Connecté en tant que ${user.email}`
                : "Compte application + liaison API vendeur"
            }
          />
          <CardBody className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={connection.connected ? "success" : "warning"}>
                {connection.connected ? "eBay connecté" : "eBay non connecté"}
              </Badge>
              {connection.username ? (
                <span className="text-sm font-medium">{connection.username}</span>
              ) : null}
              {connection.lastSyncAt ? (
                <span className="text-xs text-muted">
                  Sync : {new Date(connection.lastSyncAt).toLocaleString("fr-FR")}
                </span>
              ) : null}
            </div>
            <Link href="/settings/connections">
              <Button variant={connection.connected ? "secondary" : "primary"}>
                {connection.connected ? "Gérer la connexion" : "Connecter eBay"}
              </Button>
            </Link>
          </CardBody>
        </Card>

        <KpiGrid kpis={kpis} />
        <ServiceStatusList services={services} />
      </div>
    </AppShell>
  );
}
