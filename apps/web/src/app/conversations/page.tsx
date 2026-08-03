import { AppShell } from "@/components/layout/app-shell";
import { ConversationsWorkspace } from "@/features/conversations/conversations-workspace";

export const dynamic = "force-dynamic";

export default function ConversationsPage() {
  return (
    <AppShell
      title="Conversations"
      description="Messagerie eBay + AI Engine — sans terminal"
    >
      <ConversationsWorkspace />
    </AppShell>
  );
}
