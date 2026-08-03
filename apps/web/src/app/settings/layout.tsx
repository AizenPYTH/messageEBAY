import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";

const TABS = [
  { href: "/settings/connections", label: "Connexions" },
  { href: "/settings", label: "Technique" },
  { href: "/settings/account", label: "Compte" },
] as const;

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell
      title="Paramètres"
      description="Compte, connexions vendeur et configuration"
    >
      <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-3">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className="rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-muted-bg hover:text-foreground"
          >
            {tab.label}
          </Link>
        ))}
      </div>
      {children}
    </AppShell>
  );
}
