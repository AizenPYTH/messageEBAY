import { AppShell } from "@/components/layout/app-shell";
import { ConversationsWorkspace } from "@/features/conversations/conversations-workspace";

export const dynamic = "force-dynamic";

export default function ConversationsPage() {
  return (
    <AppShell
      title="Messages"
      description="L’IA propose — vous validez avant envoi"
      flush
    >
      <ConversationsWorkspace />
    </AppShell>
  );
}
