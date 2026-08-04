"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV } from "@/components/layout/nav";
import { IconX } from "@/components/icons";
import { cn } from "@/lib/cn";

function NavLink({
  href,
  label,
  icon: Icon,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-sm font-medium transition-colors",
        active
          ? "bg-zinc-900 text-white"
          : "text-muted hover:bg-muted-bg/70 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "shrink-0",
          active ? "text-white" : "text-muted group-hover:text-foreground",
        )}
      />
      <span className="flex-1">{label}</span>
    </Link>
  );
}

export function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/20 transition-opacity lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-width)] flex-col border-r border-border bg-sidebar transition-transform lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between border-b border-border px-4">
          <Link
            href="/conversations"
            className="flex items-center gap-2"
            onClick={onClose}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[11px] font-bold tracking-tight text-accent-fg">
              AI
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">
                Assistant vendeur
              </div>
              <div className="text-[11px] text-muted">Réponses simples</div>
            </div>
          </Link>
          <button
            type="button"
            className="rounded-md p-1.5 text-muted hover:bg-muted-bg lg:hidden"
            onClick={onClose}
            aria-label="Fermer le menu"
          >
            <IconX />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} {...item} onNavigate={onClose} />
          ))}
        </nav>

        <div className="border-t border-border px-4 py-3 text-[11px] text-muted">
          1. Connecte eBay · 2. Entraîne · 3. Réponds
        </div>
      </aside>
    </>
  );
}
