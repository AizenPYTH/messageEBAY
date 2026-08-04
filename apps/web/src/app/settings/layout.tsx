import { AppShell } from "@/components/layout/app-shell";

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      title="Compte eBay"
      description="Connectez le compte vendeur utilisé pour répondre"
    >
      {children}
    </AppShell>
  );
}
