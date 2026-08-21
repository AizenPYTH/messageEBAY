"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV } from "@/components/layout/nav";
import { IconX } from "@/components/icons";
import { getShellAccountAction } from "@/app/shell/actions";
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
        "group flex items-center gap-2.5 rounded-[var(--radius-md)] border-l-4 px-3 py-2.5 text-sm font-medium transition-[background-color,color,border-color] duration-200",
        active
          ? "border-[var(--accent-amber)] bg-[var(--accent-amber)]/10 text-[var(--accent-amber)]"
          : "border-transparent text-slate-400 hover:bg-white/5 hover:text-slate-100",
      )}
    >
      <Icon
        className={cn(
          "shrink-0",
          active ? "text-[var(--accent-amber)]" : "text-slate-500 group-hover:text-slate-300",
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
  const [account, setAccount] = useState<{
    connected: boolean;
    username: string | null;
  } | null>(null);

  useEffect(() => {
    void getShellAccountAction().then(setAccount);
  }, []);

  return (
    <>
      <div
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
        aria-hidden
      />

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[var(--sidebar-width)] flex-col bg-[var(--primary-dark)] transition-transform duration-300 lg:static lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center justify-between px-5">
          <Link
            href="/conversations"
            className="flex items-center gap-2.5"
            onClick={onClose}
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] bg-[var(--accent-amber)] text-xs font-black text-[var(--primary-dark)]">
              AI
            </span>
            <div className="leading-tight">
              <div className="text-sm font-semibold tracking-tight text-white">
                Message AI
              </div>
              <div className="text-[11px] text-slate-400">Assistant vendeur</div>
            </div>
          </Link>
          <button
            type="button"
            className="rounded-[var(--radius-md)] p-1.5 text-slate-400 hover:bg-white/5 hover:text-white lg:hidden"
            onClick={onClose}
            aria-label="Fermer le menu"
          >
            <IconX />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          {PRIMARY_NAV.map((item) => (
            <NavLink key={item.href} {...item} onNavigate={onClose} />
          ))}
        </nav>

        <div className="mx-3 mb-4 rounded-[var(--radius-lg)] border border-[var(--accent-amber)]/20 bg-[var(--accent-amber)]/10 p-3">
          <p className="text-[11px] text-slate-400">Compte eBay</p>
          {account?.connected && account.username ? (
            <>
              <p className="mt-1 truncate text-sm font-semibold text-[var(--accent-amber)]">
                {account.username}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Connecté</p>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm font-semibold text-slate-300">
                Non connecté
              </p>
              <Link
                href="/settings/connections"
                onClick={onClose}
                className="mt-2 inline-block text-[11px] font-medium text-[var(--accent-amber)] hover:underline"
              >
                Connecter eBay →
              </Link>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
