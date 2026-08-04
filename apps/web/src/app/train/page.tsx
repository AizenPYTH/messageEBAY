import { AppShell } from "@/components/layout/app-shell";
import { TrainPanel } from "@/features/train/train-panel";

export const dynamic = "force-dynamic";

export default function TrainPage() {
  return (
    <AppShell
      title="Entraîner"
      description="Apprenez à l’assistant avec vos anciennes réponses"
    >
      <TrainPanel />
    </AppShell>
  );
}
