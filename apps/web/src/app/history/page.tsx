import { AppShell } from "@/components/layout/app-shell";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default function HistoryPage() {
  return (
    <AppShell title="Historique" description="Activité récente">
      <PagePlaceholder
        title="Historique"
        description="Journal des syncs, générations et envois."
        bullets={[
          "Timeline des actions vendeur",
          "Filtres par conversation / annonce",
          "Export CSV (plus tard)",
        ]}
      />
    </AppShell>
  );
}
