"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  getAutopilotStatusAction,
  runAutopilotNowAction,
  setAutopilotEnabledAction,
} from "@/app/conversations/autopilot-actions";
import {
  generateReplyAction,
  getConversationAction,
  listConversationsAction,
  sendReplyAction,
  syncConversationAction,
} from "@/app/conversations/actions";
import { IconHistory } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import type {
  AiGenerationDto,
  ConversationDetailDto,
  InboxListItemDto,
} from "@/server/conversations";

type StatusMessage = {
  tone: "neutral" | "success" | "warning" | "danger";
  text: string;
};

type InboxFilter = "all" | "unread";

function relativeTime(dateIso?: string, fallback?: string): string {
  if (!dateIso) return fallback ?? "";
  const t = Date.parse(dateIso);
  if (!Number.isFinite(t)) return fallback ?? "";
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "À l’instant";
  if (mins < 60) return `Il y a ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "Hier";
  if (days < 7) return `Il y a ${days} j`;
  return fallback ?? "";
}

function initials(name?: string): string {
  const clean = (name ?? "").trim();
  if (!clean) return "?";
  const parts = clean.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return clean.slice(0, 2).toUpperCase();
}

function dayKey(dateIso?: string): string | null {
  if (!dateIso) return null;
  const t = Date.parse(dateIso);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(dateIso?: string): string {
  if (!dateIso) return "";
  const t = Date.parse(dateIso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  ) {
    return "Aujourd’hui";
  }
  if (
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate()
  ) {
    return "Hier";
  }
  return d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function clockLabel(dateIso?: string, fallback?: string): string {
  if (!dateIso) return fallback ?? "";
  const t = Date.parse(dateIso);
  if (!Number.isFinite(t)) return fallback ?? "";
  return new Date(t).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ConversationsWorkspace() {
  const [items, setItems] = useState<InboxListItemDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobilePane, setMobilePane] = useState<"inbox" | "thread">("inbox");
  const [detail, setDetail] = useState<ConversationDetailDto | null>(null);
  const [query, setQuery] = useState("");
  const [inboxTab, setInboxTab] = useState<InboxFilter>("all");
  const [draft, setDraft] = useState("");
  const [generation, setGeneration] = useState<AiGenerationDto | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const threadRef = useRef<HTMLDivElement>(null);

  const [listPending, startListTransition] = useTransition();
  const [detailPending, startDetailTransition] = useTransition();
  const [generatePending, startGenerateTransition] = useTransition();
  const [sendPending, startSendTransition] = useTransition();
  const [syncPending, startSyncTransition] = useTransition();
  const [autopilotPending, startAutopilotTransition] = useTransition();
  const [autopilotOn, setAutopilotOn] = useState(false);
  const [autopilotSummary, setAutopilotSummary] = useState<string | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  const refreshList = useCallback((keepSelection = true) => {
    startListTransition(async () => {
      setListError(null);
      const result = await listConversationsAction();
      if (!result.ok) {
        setListError(result.error);
        setItems([]);
        return;
      }
      setItems(result.data);

      const params =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : null;
      const fromUrl = params?.get("c")?.trim() || null;
      const current = selectedIdRef.current;

      const preferred =
        (fromUrl &&
        result.data.some((item) => item.conversationId === fromUrl)
          ? fromUrl
          : null) ??
        result.data.find((item) => item.unreadCount > 0)?.conversationId ??
        result.data[0]?.conversationId ??
        null;

      if (!keepSelection) {
        setSelectedId(preferred);
      } else if (
        current &&
        !result.data.some((item) => item.conversationId === current)
      ) {
        setSelectedId(preferred);
      } else if (!current) {
        setSelectedId(preferred);
      }
    });
  }, []);

  const loadDetail = useCallback(
    (conversationId: string, options?: { soft?: boolean }) => {
      startDetailTransition(async () => {
        setDetailError(null);
        if (!options?.soft) {
          setDetail(null);
          setGeneration(null);
          setDraft("");
        }
        const result = await getConversationAction(conversationId);
        if (!result.ok) {
          setDetailError(result.error);
          return;
        }
        // Ignore stale responses if user switched conversation.
        if (selectedIdRef.current !== conversationId) return;
        setDetail((prev) => {
          if (
            options?.soft &&
            prev &&
            prev.conversationId === result.data.conversationId &&
            prev.messages.length === result.data.messages.length &&
            prev.messages.every(
              (m, i) =>
                m.messageId === result.data.messages[i]?.messageId &&
                m.body === result.data.messages[i]?.body,
            )
          ) {
            return prev;
          }
          return result.data;
        });
      });
    },
    [],
  );

  const refreshAll = useCallback(() => {
    refreshList(true);
    const id = selectedIdRef.current;
    if (id) loadDetail(id, { soft: true });
  }, [refreshList, loadDetail]);

  useEffect(() => {
    refreshList(false);
    startAutopilotTransition(async () => {
      const res = await getAutopilotStatusAction();
      if (res.ok) {
        setAutopilotOn(res.data.enabled);
        setAutopilotSummary(res.data.lastRunSummary ?? null);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep inbox fresh slowly — do not yank the open thread while reading.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      refreshList(true);
      if (stickToBottomRef.current && selectedIdRef.current) {
        loadDetail(selectedIdRef.current, { soft: true });
      }
    }, 90_000);

    function onVisible() {
      if (document.visibilityState === "visible") refreshList(true);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refreshList, loadDetail]);

  // While Auto ON and this page stays open, process inbox every 10 minutes.
  useEffect(() => {
    if (!autopilotOn) return;
    let cancelled = false;

    async function tick() {
      if (cancelled || document.visibilityState === "hidden") return;
      const res = await runAutopilotNowAction();
      if (cancelled) return;
      if (res.ok) {
        setAutopilotSummary(res.data.summary);
        const quiet = /^Envoyés 0 · Alertes 0 · Ignorés \d+ · Erreurs 0$/.test(
          res.data.summary,
        );
        if (!quiet) {
          setStatus({ tone: "success", text: `Auto: ${res.data.summary}` });
          refreshAll();
        }
      }
    }

    const id = window.setInterval(() => {
      void tick();
    }, 10 * 60 * 1000);
    void tick();
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [autopilotOn, refreshAll]);

  function onToggleAutopilot() {
    const next = !autopilotOn;
    if (next) {
      const ok = window.confirm(
        "Activer le mode automatique ?\n\nLe bot répond aux questions non lues des 7 derniers jours (pas les vieux fils d'avril).\n\nRègles : annonce + description + historique. Merci / ok / hors sujet / doute → rien envoyé. Photos, bordereau, litiges… → alerte Rapports.\n\nUn premier passage part tout de suite, puis cron serveur.",
      );
      if (!ok) return;
    }
    startAutopilotTransition(async () => {
      const res = await setAutopilotEnabledAction(next);
      if (!res.ok) {
        setStatus({ tone: "danger", text: res.error });
        return;
      }
      setAutopilotOn(res.data.enabled);
      setAutopilotSummary(res.data.lastRunSummary ?? null);
      if (!res.data.enabled) {
        setStatus({ tone: "neutral", text: "Mode automatique OFF." });
        return;
      }
      setStatus({
        tone: "success",
        text: "Mode auto ON — questions non lues des 7 derniers jours…",
      });
      const run = await runAutopilotNowAction();
      if (run.ok) {
        setAutopilotSummary(run.data.summary);
        setStatus({
          tone: "success",
          text: `Auto activé — ${run.data.summary}`,
        });
        refreshAll();
      } else {
        setStatus({
          tone: "danger",
          text: `Auto ON, mais le premier passage a échoué : ${run.error}`,
        });
      }
    });
  }

  useEffect(() => {
    if (selectedId) loadDetail(selectedId, { soft: false });
  }, [selectedId, loadDetail]);

  const stickToBottomRef = useRef(true);
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    function onScroll() {
      const node = threadRef.current;
      if (!node) return;
      const dist = node.scrollHeight - node.scrollTop - node.clientHeight;
      stickToBottomRef.current = dist < 80;
    }
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [selectedId]);

  useEffect(() => {
    if (!stickToBottomRef.current || !threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [detail?.messages.length, selectedId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.buyer.toLowerCase().includes(q) ||
        item.listingTitle.toLowerCase().includes(q) ||
        item.lastMessagePreview.toLowerCase().includes(q),
    );
  }, [items, query]);

  const counts = useMemo(() => {
    const unreadConversations = filtered.filter(
      (item) => item.unreadCount > 0,
    ).length;
    const unreadMessages = filtered.reduce(
      (sum, item) => sum + Math.max(0, item.unreadCount),
      0,
    );
    return {
      all: filtered.length,
      unreadConversations,
      unreadMessages,
    };
  }, [filtered]);

  const visibleItems = useMemo(() => {
    if (inboxTab === "unread") {
      return filtered.filter((item) => item.unreadCount > 0);
    }
    return filtered;
  }, [filtered, inboxTab]);

  function selectConversation(id: string) {
    setSelectedId(id);
    setMobilePane("thread");
  }

  function onGenerate() {
    if (!selectedId) return;
    startGenerateTransition(async () => {
      setStatus({ tone: "neutral", text: "Génération en cours…" });
      const result = await generateReplyAction(selectedId);
      if (!result.ok) {
        setStatus({ tone: "danger", text: result.error });
        return;
      }
      setGeneration(result.data);
      if (result.data.escalated) {
        setDraft("");
        const label =
          result.data.escalationLabel ?? "Intervention vendeur requise";
        setStatus({
          tone: "warning",
          text: result.data.alertCreated
            ? `Alerte créée — ${label}`
            : `Alerte déjà ouverte — ${label}`,
        });
        return;
      }
      setDraft(result.data.reply);
      if (result.data.shipment) {
        const s = result.data.shipment;
        const trackNote =
          s.kind === "not_shipped"
            ? "Colis pas encore expédié (pas de suivi eBay)."
            : s.kind === "shipped"
              ? `Suivi transporteur${s.trackingNumber ? ` ${s.trackingNumber}` : ""}${s.detailMessage ? ` — ${s.detailMessage}` : s.statusLabel ? ` — ${s.statusLabel}` : ""}.`
              : `Suivi : ${s.kind}.`;
        setStatus({ tone: "success", text: trackNote });
        return;
      }
      const digestNote = result.data.digestCreated
        ? " Rapport conversation créé."
        : "";
      setStatus({
        tone: "success",
        text: `Réponse prête.${digestNote}`,
      });
    });
  }

  function onCopy() {
    if (!draft.trim()) return;
    void navigator.clipboard.writeText(draft);
    setStatus({ tone: "success", text: "Copié." });
  }

  function onSend() {
    if (!selectedId || !draft.trim()) return;
    if (!window.confirm("Envoyer cette réponse sur eBay ?")) return;
    const text = draft.trim();
    startSendTransition(async () => {
      setStatus({ tone: "neutral", text: "Envoi…" });
      const result = await sendReplyAction(selectedId, text);
      if (!result.ok) {
        setStatus({ tone: "danger", text: result.error });
        return;
      }
      // Optimistic: show on the right immediately (seller side).
      setDetail((prev) => {
        if (!prev || prev.conversationId !== selectedId) return prev;
        const now = new Date().toISOString();
        return {
          ...prev,
          messages: [
            ...prev.messages,
            {
              messageId: `local-${Date.now()}`,
              senderUsername: prev.seller.username,
              createdDate: now,
              dateLabel: "À l’instant",
              body: text,
              isFromSeller: true,
            },
          ],
        };
      });
      setDraft("");
      setGeneration(null);
      setStatus({ tone: "success", text: "Message envoyé." });
      refreshAll();
    });
  }

  function onSync() {
    if (!selectedId) return;
    startSyncTransition(async () => {
      const result = await syncConversationAction(selectedId);
      if (!result.ok) {
        setStatus({ tone: "danger", text: result.error });
        return;
      }
      setStatus({
        tone: "success",
        text: `Synchronisé (${result.data.messagesSaved} msg).`,
      });
    });
  }

  const tabs: Array<{ id: InboxFilter; label: string; count: number }> = [
    { id: "all", label: "Tous", count: counts.all },
    {
      id: "unread",
      label: "Non lus",
      count: counts.unreadMessages || counts.unreadConversations,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      {status ? (
        <div
          className={cn(
            "fade-in shrink-0 border-b px-4 py-2 text-sm",
            status.tone === "success" &&
              "border-emerald-100 bg-emerald-50 text-[var(--success)]",
            status.tone === "danger" &&
              "border-red-100 bg-red-50 text-[var(--warning)]",
            status.tone === "warning" &&
              "border-amber-100 bg-[var(--accent-amber-soft)] text-[var(--accent-amber-hover)]",
            status.tone === "neutral" &&
              "border-[var(--border-light)] bg-white text-[var(--text-secondary)]",
          )}
        >
          {status.text}{" "}
          {generation?.escalated || generation?.digestCreated ? (
            <Link href="/reports" className="font-semibold underline">
              Voir Rapports
            </Link>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1">
        {/* Liste messages */}
        <section
          className={cn(
            "flex w-full shrink-0 flex-col border-r border-[var(--border-light)] bg-white md:w-[var(--inbox-width)]",
            mobilePane === "thread" ? "hidden md:flex" : "flex",
          )}
        >
          <div className="border-b border-[var(--border-light)] px-3 py-3">
            <div className="flex items-center gap-1.5">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setInboxTab(tab.id)}
                  className={cn(
                    "flex-1 rounded-[var(--radius-md)] px-2 py-2 text-xs font-semibold transition-colors duration-200",
                    inboxTab === tab.id
                      ? "bg-[var(--accent-amber)] text-white"
                      : "border border-[var(--border-medium)] bg-white text-[var(--text-secondary)] hover:border-[var(--accent-amber)]",
                  )}
                >
                  {tab.label}
                  <span className="ml-1 opacity-90">({tab.count})</span>
                </button>
              ))}
              <button
                type="button"
                onClick={() => refreshAll()}
                disabled={listPending || detailPending}
                className="rounded-[var(--radius-md)] p-2 text-[var(--text-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                aria-label="Actualiser"
                title="Actualiser liste + conversation"
              >
                {listPending || detailPending ? <Spinner /> : <IconHistory />}
              </button>
            </div>
            <div className="mt-2.5 flex gap-2">
              <button
                type="button"
                onClick={onToggleAutopilot}
                disabled={autopilotPending}
                title={
                  autopilotSummary
                    ? `Dernier run: ${autopilotSummary}`
                    : "Répond aux messages seul (week-end)"
                }
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-[var(--radius-md)] px-3 py-2 text-xs font-semibold transition-colors duration-200 disabled:opacity-50",
                  autopilotOn
                    ? "bg-emerald-600 text-white hover:bg-emerald-700"
                    : "border border-[var(--border-medium)] bg-white text-[var(--text-secondary)] hover:border-emerald-500 hover:text-emerald-700",
                )}
              >
                {autopilotPending ? <Spinner /> : null}
                {autopilotOn ? "Auto ON" : "Mode auto"}
              </button>
              {autopilotOn ? (
                <button
                  type="button"
                  disabled={autopilotPending}
                  onClick={() => {
                    startAutopilotTransition(async () => {
                      setStatus({
                        tone: "neutral",
                        text: "Passage auto en cours…",
                      });
                      const res = await runAutopilotNowAction();
                      if (!res.ok) {
                        setStatus({ tone: "danger", text: res.error });
                        return;
                      }
                      setAutopilotSummary(res.data.summary);
                      setStatus({
                        tone: "success",
                        text: res.data.summary,
                      });
                      refreshAll();
                    });
                  }}
                  className="rounded-[var(--radius-md)] border border-[var(--border-medium)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)] hover:border-emerald-500 hover:text-emerald-700 disabled:opacity-50"
                >
                  Lancer
                </button>
              ) : null}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher…"
              className="mt-2.5 w-full rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--primary-light)] px-3 py-2 text-sm outline-none focus:border-[var(--accent-amber)]"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {listError ? (
              <p className="p-4 text-sm text-[var(--warning)]">{listError}</p>
            ) : null}
            {listPending && items.length === 0 ? (
              <p className="p-4 text-sm text-[var(--text-muted)]">
                Chargement…
              </p>
            ) : null}
            {!listPending && visibleItems.length === 0 ? (
              <p className="p-6 text-center text-sm text-[var(--text-muted)]">
                {inboxTab === "unread"
                  ? "Aucun message non lu (eBay)."
                  : "Aucune conversation"}
              </p>
            ) : null}
            {visibleItems.map((item) => {
              const active = item.conversationId === selectedId;
              const unread = item.unreadCount > 0;
              const awaiting = item.awaitingReply;
              return (
                <button
                  key={item.conversationId}
                  type="button"
                  onClick={() => selectConversation(item.conversationId)}
                  className={cn(
                    "relative w-full border-b border-[var(--border-light)] px-3.5 py-3 text-left transition-colors duration-200",
                    active
                      ? "bg-[var(--accent-amber-soft)]"
                      : unread
                        ? "bg-white hover:bg-amber-50/60"
                        : "bg-transparent hover:bg-[var(--bg-hover)]",
                  )}
                >
                  <div className="flex gap-3">
                    <div
                      className={cn(
                        "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
                        unread || awaiting
                          ? "bg-[var(--accent-amber)] text-white"
                          : "bg-slate-200 text-slate-600",
                      )}
                    >
                      {initials(item.buyer)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={cn(
                            "truncate text-sm",
                            unread
                              ? "font-bold text-[var(--text-primary)]"
                              : "font-semibold text-[var(--text-primary)]",
                          )}
                        >
                          {item.buyer}
                        </span>
                        <span className="shrink-0 text-[10px] tabular-nums text-[var(--text-muted)]">
                          {relativeTime(item.dateIso, item.dateLabel)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
                        {item.listingTitle}
                      </p>
                      <p
                        className={cn(
                          "mt-1 line-clamp-2 text-xs leading-snug",
                          unread
                            ? "font-medium text-[var(--text-primary)]"
                            : "text-[var(--text-muted)]",
                        )}
                      >
                        {item.lastSenderSide === "seller" ? "Vous : " : ""}
                        {item.lastMessagePreview}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {unread ? (
                          <span className="inline-flex items-center rounded-full bg-[var(--accent-amber)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {item.unreadCount} non lu
                            {item.unreadCount > 1 ? "s" : ""}
                          </span>
                        ) : null}
                        {awaiting ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                            À répondre
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Thread + reply */}
        <section
          className={cn(
            "min-w-0 flex-1 flex-col bg-white",
            mobilePane === "inbox" ? "hidden md:flex" : "flex",
          )}
        >
          {!selectedId ? (
            <div className="flex flex-1 items-center justify-center text-sm text-[var(--text-muted)]">
              Sélectionnez une conversation
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-light)] bg-white px-4 py-3 lg:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    className="text-xs font-medium text-[var(--accent-amber)] md:hidden"
                    onClick={() => setMobilePane("inbox")}
                  >
                    ←
                  </button>
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                    {initials(detail?.buyer)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                      {detail?.buyer ?? "…"}
                    </div>
                    <div className="truncate text-xs text-[var(--text-secondary)]">
                      {detail?.listing.title ?? "Chargement…"}
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2 text-xs text-[var(--text-muted)]">
                  {detail ? (
                    <span className="hidden sm:inline">
                      {detail.messages.length} msg
                    </span>
                  ) : null}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onSync}
                    disabled={syncPending}
                  >
                    {syncPending ? <Spinner /> : null}
                    Sync
                  </Button>
                </div>
              </div>

              <div
                ref={threadRef}
                className="chat-canvas min-h-0 flex-1 space-y-1 overflow-y-auto px-3 py-4 sm:px-5 lg:px-6"
              >
                {detailPending ? (
                  <p className="text-sm text-[var(--text-muted)]">
                    Chargement…
                  </p>
                ) : null}
                {detailError ? (
                  <p className="text-sm text-[var(--warning)]">{detailError}</p>
                ) : null}
                {detail && !detailPending
                  ? detail.messages.map((message, index) => {
                      const mine = message.isFromSeller;
                      const prev = detail.messages[index - 1];
                      const showDay =
                        dayKey(message.createdDate) !==
                        dayKey(prev?.createdDate);
                      const peerLabel =
                        message.senderUsername?.trim() || detail.buyer || "Client";
                      return (
                        <div key={message.messageId ?? `${index}-${message.createdDate}`}>
                          {showDay ? (
                            <div className="my-3 flex justify-center">
                              <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-muted)] shadow-sm ring-1 ring-black/5">
                                {dayLabel(message.createdDate) || message.dateLabel}
                              </span>
                            </div>
                          ) : null}
                          <div
                            className={cn(
                              "msg-enter flex w-full gap-2",
                              mine ? "justify-end" : "justify-start",
                            )}
                            style={{
                              animationDelay: `${Math.min(index, 8) * 35}ms`,
                            }}
                          >
                            {!mine ? (
                              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-300 text-[10px] font-bold text-slate-700">
                                {initials(peerLabel)}
                              </div>
                            ) : null}
                            <div
                              className={cn(
                                "max-w-[min(78%,28rem)]",
                                mine ? "items-end" : "items-start",
                              )}
                            >
                              <div
                                className={cn(
                                  "px-3.5 py-2.5 text-[13px] leading-relaxed shadow-sm",
                                  mine
                                    ? "rounded-2xl rounded-br-md bg-[#0f766e] text-white"
                                    : "rounded-2xl rounded-bl-md border border-black/5 bg-white text-[var(--text-primary)]",
                                )}
                              >
                                <div
                                  className={cn(
                                    "mb-1 flex items-baseline justify-between gap-3 text-[10px] font-semibold",
                                    mine ? "text-white/75" : "text-slate-500",
                                  )}
                                >
                                  <span className="truncate">
                                    {mine ? "Vous" : peerLabel}
                                  </span>
                                  <span className="shrink-0 font-normal opacity-80">
                                    {clockLabel(
                                      message.createdDate,
                                      message.dateLabel,
                                    )}
                                  </span>
                                </div>
                                <div className="whitespace-pre-wrap break-words">
                                  {message.body}
                                </div>
                              </div>
                            </div>
                            {mine ? (
                              <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0f766e] text-[10px] font-bold text-white">
                                {initials(
                                  detail.seller.username ||
                                    detail.seller.displayName ||
                                    "Vous",
                                )}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })
                  : null}
              </div>

              {/* Reply panel */}
              <div className="shrink-0 border-t border-[var(--border-light)] bg-white p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.04)] lg:px-6">
                {generation?.escalated ? (
                  <div className="mb-3 rounded-xl border border-amber-200 bg-[var(--accent-amber-soft)] px-3 py-3 text-sm text-[var(--accent-amber-hover)]">
                    <p className="font-semibold">
                      Intervention requise
                      {generation.escalationLabel
                        ? ` — ${generation.escalationLabel}`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs">
                      L’IA n’a pas répondu. Traitez-le vous-même.
                    </p>
                    <Link
                      href="/reports"
                      className="mt-2 inline-block text-xs font-semibold underline"
                    >
                      Ouvrir Rapports
                    </Link>
                  </div>
                ) : (
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      Réponse
                    </div>
                    {generation?.intentLabel ? (
                      <Badge tone="neutral">{generation.intentLabel}</Badge>
                    ) : null}
                  </div>
                )}

                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={
                    generation?.escalated
                      ? "Écrivez votre réponse manuelle…"
                      : "Générer une suggestion, ou écrire directement…"
                  }
                  className={cn(
                    "min-h-28 w-full resize-y rounded-xl border border-[var(--border-light)] bg-[var(--primary-light)]/60 px-3.5 py-3 text-sm leading-relaxed text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent-amber)] focus:bg-white",
                    generatePending && "draft-generating",
                    generation && !generation.escalated && !draft
                      ? "border-[var(--warning)]"
                      : "",
                  )}
                />

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={onGenerate}
                    disabled={!selectedId || generatePending}
                  >
                    {generatePending ? (
                      <Spinner className="border-t-white" />
                    ) : null}
                    Générer
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={onSend}
                    disabled={!selectedId || !draft.trim() || sendPending}
                  >
                    {sendPending ? <Spinner className="border-t-white" /> : null}
                    Envoyer
                  </Button>
                  <Button
                    size="sm"
                    onClick={onCopy}
                    disabled={!draft.trim()}
                  >
                    Copier
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
