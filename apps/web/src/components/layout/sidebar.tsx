"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { DEV_NAV, PRIMARY_NAV } from "@/components/layout/nav";
import { IconX } from "@/components/icons";
import { cn } from "@/lib/cn";

function NavLink({
  href,
  label,
  icon: Icon,
  badge,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors",
        active
          ? "bg-muted-bg text-foreground"
          : "text-muted hover:bg-muted-bg/70 hover:text-foreground",
      )}
    >
      <Icon
        className={cn(
          "shrink-0",
          active ? "text-foreground" : "text-muted group-hover:text-foreground",
        )}
      />
      <span className="flex-1">{label}</span>
      {badge ? (
        <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
          {badge}
        </span>
      ) : null}
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
          <Link href="/dashboard" className="flex items-center gap-2" onClick={onClose}>
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-accent text-[11px] font-bold tracking-tight text-accent-fg">
              EA
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight">eBay AI</div>
              <div className="text-[11px] text-muted">Seller Assistant</div>
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

        <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
          <div className="space-y-0.5">
            {PRIMARY_NAV.map((item) => (
              <NavLink key={item.href} {...item} onNavigate={onClose} />
            ))}
          </div>
          <div>
            <div className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted">
              Développeur
            </div>
            <div className="space-y-0.5">
              {DEV_NAV.map((item) => (
                <NavLink key={item.href} {...item} onNavigate={onClose} />
              ))}
            </div>
          </div>
        </nav>

        <div className="border-t border-border px-4 py-3">
          <p className="text-[11px] text-muted">Phase 1 — fondations SaaS</p>
          <Link
            href="/login"
            onClick={onClose}
            className="mt-1 inline-block text-[12px] font-medium text-foreground underline-offset-2 hover:underline"
          >
            Connexion (bientôt)
          </Link>
        </div>
      </aside>
    </>
  );
}
