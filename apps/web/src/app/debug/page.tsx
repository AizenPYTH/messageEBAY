import { AppShell } from "@/components/layout/app-shell";
import { PagePlaceholder } from "@/components/layout/page-placeholder";

export default function DebugPage() {
  return (
    <AppShell
      title="Debug"
      description="Panneau développeur — Prompt Engine"
    >
      <PagePlaceholder
        title="Prompt & traces"
        description="Panneau masquable pour inspecter chaque génération."
        bullets={[
          "Prompt système / utilisateur",
          "Contexte annonce + conversation",
          "Conversations RAG similaires",
          "Tokens, latence, modèle",
          "Accessible depuis Conversations (drawer) à l’étape suivante",
        ]}
      />
    </AppShell>
  );
}
