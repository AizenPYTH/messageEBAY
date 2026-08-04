import { AppShell } from "@/components/layout/app-shell";
import { ConversationsWorkspace } from "@/features/conversations/conversations-workspace";

export const dynamic = "force-dynamic";

export default function ConversationsPage() {
  return (
    <AppShell
      title="Messages"
      description="Répondez aux clients — l’IA propose, vous validez"
    >
      <ConversationsWorkspace />
    </AppShell>
  );
}
