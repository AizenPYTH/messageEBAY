import { AppShell } from "@/components/layout/app-shell";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default function RepliesPage() {
  return (
    <AppShell
      title="Réponses IA"
      description="Suivi des générations et envois"
    >
      <PagePlaceholder
        title="File des réponses"
        description="Cette page listera les réponses générées, validées et envoyées."
        bullets={[
          "Lecture depuis ebay_ai.ai_replies",
          "Filtres : générée / validée / envoyée",
          "Lien vers la conversation source",
          "Coût tokens / modèle par réponse",
        ]}
      />
    </AppShell>
  );
}
