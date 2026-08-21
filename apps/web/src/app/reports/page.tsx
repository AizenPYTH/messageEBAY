import { AppShell } from "@/components/layout/app-shell";
import { ReportsPanel } from "@/features/reports/reports-panel";

export const dynamic = "force-dynamic";

export default function ReportsPage() {
  return (
    <AppShell
      title="Rapports"
      description="Alertes et suivi de ce qui se passe avec vos acheteurs"
    >
      <ReportsPanel />
    </AppShell>
  );
}
