import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { ServiceHealth, ServiceStatus } from "@/server/health";

function toneFor(status: ServiceStatus): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "ok":
      return "success";
    case "degraded":
    case "unconfigured":
      return "warning";
    case "down":
      return "danger";
    default:
      return "neutral";
  }
}

function labelFor(status: ServiceStatus): string {
  switch (status) {
    case "ok":
      return "OK";
    case "degraded":
      return "Dégradé";
    case "down":
      return "Down";
    case "unconfigured":
      return "Non configuré";
    default:
      return status;
  }
}

export function ServiceStatusList({ services }: { services: ServiceHealth[] }) {
  return (
    <Card>
      <CardHeader
        title="État des services"
        description="Vérifications côté serveur (eBay Message API, OpenAI, Supabase)."
      />
      <CardBody className="space-y-3">
        {services.map((service) => (
          <div
            key={service.name}
            className="flex items-start justify-between gap-4 rounded-lg border border-border px-3 py-3"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{service.name}</span>
                <Badge tone={toneFor(service.status)}>
                  {labelFor(service.status)}
                </Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted">{service.detail}</p>
            </div>
            <div className="shrink-0 text-xs tabular-nums text-muted">
              {service.latencyMs !== undefined ? `${service.latencyMs} ms` : "—"}
            </div>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
