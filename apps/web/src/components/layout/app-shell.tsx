"use client";

import { useState } from "react";
import { IconMenu } from "@/components/icons";
import { Sidebar } from "@/components/layout/sidebar";
import { cn } from "@/lib/cn";

export function AppShell({
  title,
  description,
  children,
  actions,
  /** Full-height workspace without padded main (Messages). */
  flush = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  flush?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-dvh min-h-0 overflow-hidden bg-[var(--primary-light)]">
      <Sidebar open={open} onClose={() => setOpen(false)} />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "z-30 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border-light)] bg-white/90 px-4 backdrop-blur",
            flush ? "lg:px-5" : "lg:px-8",
          )}
        >
          <button
            type="button"
            className="rounded-[var(--radius-md)] p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <IconMenu />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-sm font-semibold tracking-tight text-[var(--text-primary)]">
              {title}
            </h1>
            {description ? (
              <p className="truncate text-xs text-[var(--text-muted)]">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex items-center gap-2">{actions}</div>
          ) : null}
        </header>

        <main
          className={cn(
            "min-h-0 flex-1",
            flush ? "overflow-hidden" : "overflow-y-auto px-4 py-6 lg:px-8",
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
