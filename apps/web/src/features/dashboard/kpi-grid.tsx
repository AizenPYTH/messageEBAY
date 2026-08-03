import { Card, CardBody } from "@/components/ui/card";
import type { DashboardKpis } from "@/server/health";

function formatValue(value: number | null, suffix = ""): string {
  if (value === null || value === undefined) return "—";
  return `${value.toLocaleString("fr-FR")}${suffix}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const ITEMS: Array<{
  key: keyof DashboardKpis;
  label: string;
  format?: (v: DashboardKpis) => string;
}> = [
  { key: "conversations", label: "Conversations" },
  { key: "messagesToday", label: "Messages (total sync)" },
  { key: "repliesGenerated", label: "Réponses générées" },
  { key: "repliesSent", label: "Réponses envoyées" },
  { key: "repliesValidated", label: "Réponses validées" },
  {
    key: "avgResponseTimeMs",
    label: "Temps moyen de réponse",
    format: (k) =>
      k.avgResponseTimeMs === null
        ? "—"
        : `${Math.round(k.avgResponseTimeMs / 1000)} s`,
  },
  {
    key: "openaiCostUsd",
    label: "Coût OpenAI",
    format: (k) =>
      k.openaiCostUsd === null ? "—" : `$${k.openaiCostUsd.toFixed(2)}`,
  },
  { key: "conversationsSynced", label: "Conversations synchronisées" },
  {
    key: "lastSyncAt",
    label: "Dernière synchronisation",
    format: (k) => formatDate(k.lastSyncAt),
  },
];

export function KpiGrid({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {ITEMS.map((item) => (
        <Card key={item.key}>
          <CardBody className="py-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted">
              {item.label}
            </div>
            <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
              {item.format
                ? item.format(kpis)
                : formatValue(kpis[item.key] as number | null)}
            </div>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
