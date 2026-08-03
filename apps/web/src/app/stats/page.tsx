import { AppShell } from "@/components/layout/app-shell";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default function StatsPage() {
  return (
    <AppShell title="Statistiques" description="Performance et coûts">
      <PagePlaceholder
        title="Statistiques"
        description="KPIs détaillés pour piloter l’usage de l’assistant."
        bullets={[
          "Nombre de réponses et temps gagné",
          "Coût OpenAI agrégé",
          "Questions fréquentes, taux d’acceptation",
          "Langues, top annonces, top clients",
        ]}
      />
    </AppShell>
  );
}
