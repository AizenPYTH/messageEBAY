"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  generateReplyAction,
  getConversationAction,
  listConversationsAction,
  sendReplyAction,
  syncConversationAction,
} from "@/app/conversations/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
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

function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-muted-bg", className)} />
  );
}

export function ConversationsWorkspace() {
  const [items, setItems] = useState<InboxListItemDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetailDto | null>(null);
  const [query, setQuery] = useState("");
  const [inboxTab, setInboxTab] = useState<"todo" | "done">("todo");
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(true);
  const [generation, setGeneration] = useState<AiGenerationDto | null>(null);
  const [debugOpen, setDebugOpen] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusMessage | null>(null);

  const [listPending, startListTransition] = useTransition();
  const [detailPending, startDetailTransition] = useTransition();
  const [generatePending, startGenerateTransition] = useTransition();
  const [sendPending, startSendTransition] = useTransition();
  const [syncPending, startSyncTransition] = useTransition();

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
      const preferred =
        result.data.find((item) => item.awaitingReply)?.conversationId ??
        result.data[0]?.conversationId ??
        null;
      if (!keepSelection) {
        setSelectedId(preferred);
      } else if (
        selectedId &&
        !result.data.some((item) => item.conversationId === selectedId)
      ) {
        setSelectedId(preferred);
      } else if (!selectedId) {
        setSelectedId(preferred);
      }
    });
  }, [selectedId]);

  const loadDetail = useCallback((conversationId: string) => {
    startDetailTransition(async () => {
      setDetailError(null);
      setDetail(null);
      setGeneration(null);
      setDraft("");
      const result = await getConversationAction(conversationId);
      if (!result.ok) {
        setDetailError(result.error);
        return;
      }
      setDetail(result.data);
    });
  }, []);

  useEffect(() => {
    refreshList(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedId) loadDetail(selectedId);
  }, [selectedId, loadDetail]);

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

  const todoItems = useMemo(
    () => filtered.filter((item) => item.awaitingReply),
    [filtered],
  );
  const doneItems = useMemo(
    () => filtered.filter((item) => !item.awaitingReply),
    [filtered],
  );
  const visibleItems = inboxTab === "todo" ? todoItems : doneItems;

  function renderInboxItem(item: InboxListItemDto) {
    const active = item.conversationId === selectedId;
    const fromClient = item.lastSenderSide === "client";
    return (
      <button
        key={item.conversationId}
        type="button"
        onClick={() => setSelectedId(item.conversationId)}
        className={cn(
          "w-full rounded-lg border px-3 py-3 text-left transition-colors",
          active
            ? "border-amber-300 bg-amber-50/70"
            : fromClient
              ? "border-amber-200/80 bg-amber-50/30 hover:bg-amber-50/60"
              : "border-border hover:bg-muted-bg/60",
        )}
      >
        <div className="flex items-start justify-between gap-2">
          <span className="truncate text-sm font-semibold">{item.buyer}</span>
          <Badge tone={fromClient ? "warning" : "success"}>
            {fromClient ? "Client" : "Vous"}
          </Badge>
        </div>
        <p className="mt-1 truncate text-xs text-muted">{item.listingTitle}</p>
        <p className="mt-2 text-[11px] font-medium text-muted">
          Dernier msg · {fromClient ? "client" : "vous"}
          {item.lastSenderUsername ? ` (${item.lastSenderUsername})` : ""}
        </p>
        <p className="mt-0.5 line-clamp-2 text-xs text-foreground/85">
          {item.lastMessagePreview}
        </p>
        <p className="mt-1.5 text-[11px] text-muted">{item.dateLabel}</p>
      </button>
    );
  }

  function onGenerate() {
    if (!selectedId) return;
    startGenerateTransition(async () => {
      setStatus({ tone: "neutral", text: "Génération via AI Engine…" });
      const result = await generateReplyAction(selectedId);
      if (!result.ok) {
        setStatus({ tone: "danger", text: result.error });
        return;
      }
      setGeneration(result.data);
      setDraft(result.data.reply);
      setEditing(true);
      setStatus({
        tone: "success",
        text: `Réponse générée (${result.data.latencyMs} ms · ${result.data.model})`,
      });
    });
  }

  function onCopy() {
    if (!draft.trim()) return;
    void navigator.clipboard.writeText(draft);
    setStatus({ tone: "success", text: "Réponse copiée dans le presse-papiers." });
  }

  function onSend() {
    if (!selectedId || !draft.trim()) return;
    const confirmed = window.confirm(
      "Envoyer cette réponse sur eBay ? Cette action est définitive.",
    );
    if (!confirmed) return;

    startSendTransition(async () => {
      setStatus({ tone: "neutral", text: "Envoi via Message API…" });
      const result = await sendReplyAction(selectedId, draft);
      if (!result.ok) {
        setStatus({ tone: "danger", text: result.error });
        return;
      }
      setStatus({
        tone: "success",
        text: result.data.messageId
          ? `Message envoyé (${result.data.messageId})`
          : "Message envoyé.",
      });
      loadDetail(selectedId);
      refreshList(true);
    });
  }

  function onSync() {
    if (!selectedId) return;
    startSyncTransition(async () => {
      setStatus({ tone: "neutral", text: "Synchronisation Supabase…" });
      const result = await syncConversationAction(selectedId);
      if (!result.ok) {
        setStatus({ tone: "danger", text: result.error });
        return;
      }
      setStatus({
        tone: "success",
        text: `Synchronisé (${result.data.messagesSaved} messages).`,
      });
    });
  }

  return (
    <div className="space-y-4">
      {status ? (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            status.tone === "success" && "border-emerald-200 bg-emerald-50 text-success",
            status.tone === "danger" && "border-red-200 bg-red-50 text-danger",
            status.tone === "warning" && "border-amber-200 bg-amber-50 text-warning",
            status.tone === "neutral" && "border-border bg-card text-muted",
          )}
        >
          {status.text}
        </div>
      ) : null}

      <div className="grid min-h-[70vh] gap-4 xl:grid-cols-[300px_minmax(0,1fr)_340px]">
        {/* Inbox */}
        <Card className="flex min-h-[28rem] flex-col overflow-hidden">
          <CardHeader
            title="Messages"
            description="Basé sur le dernier message réel (date)"
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => refreshList(true)}
                disabled={listPending}
              >
                {listPending ? <Spinner /> : null}
                Actualiser
              </Button>
            }
          />
          <CardBody className="flex flex-1 flex-col gap-3 overflow-hidden">
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-muted-bg/50 p-1">
              <button
                type="button"
                onClick={() => setInboxTab("todo")}
                className={cn(
                  "rounded-md px-2 py-2 text-xs font-semibold transition-colors",
                  inboxTab === "todo"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                À traiter ({todoItems.length})
              </button>
              <button
                type="button"
                onClick={() => setInboxTab("done")}
                className={cn(
                  "rounded-md px-2 py-2 text-xs font-semibold transition-colors",
                  inboxTab === "done"
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-muted hover:text-foreground",
                )}
              >
                En attente client ({doneItems.length})
              </button>
            </div>

            <p className="text-[11px] leading-relaxed text-muted">
              {inboxTab === "todo"
                ? "Le client a écrit en dernier — une réponse est attendue."
                : "Vous avez écrit en dernier — en attente du client."}
            </p>

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher client, annonce…"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2"
            />

            {listError ? (
              <p className="text-sm text-danger">{listError}</p>
            ) : null}

            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              {listPending && items.length === 0
                ? Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))
                : null}

              {!listPending && filtered.length === 0 ? (
                <p className="text-sm text-muted">Aucune conversation.</p>
              ) : null}

              {!listPending && filtered.length > 0 && visibleItems.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted">
                  {inboxTab === "todo"
                    ? "Rien à traiter — passez à « En attente client »."
                    : "Aucune conversation en attente client."}
                </p>
              ) : null}

              {visibleItems.map(renderInboxItem)}
            </div>
          </CardBody>
        </Card>

        {/* Thread */}
        <Card className="flex min-h-[28rem] flex-col overflow-hidden">
          <CardHeader
            title={detail?.buyer ?? "Conversation"}
            description={
              selectedId
                ? `ID ${selectedId}`
                : "Sélectionnez une conversation"
            }
            action={
              selectedId ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={onSync}
                  disabled={syncPending}
                >
                  {syncPending ? <Spinner /> : null}
                  Synchroniser
                </Button>
              ) : null
            }
          />
          <CardBody className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
            {detailPending ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            ) : null}

            {detailError ? (
              <p className="text-sm text-danger">{detailError}</p>
            ) : null}

            {!selectedId && !detailPending ? (
              <p className="text-sm text-muted">
                Choisissez une conversation dans la liste.
              </p>
            ) : null}

            {detail && !detailPending ? (
              <>
                <div className="rounded-lg border border-border bg-muted-bg/40 px-3 py-3 text-xs">
                  <div className="font-medium text-foreground">
                    {detail.listing.title}
                  </div>
                  <div className="mt-1 grid gap-1 text-muted sm:grid-cols-2">
                    <span>
                      Prix : {detail.listing.price ?? "?"}{" "}
                      {detail.listing.currency ?? ""}
                    </span>
                    <span>État : {detail.listing.condition ?? "—"}</span>
                    <span>Statut : {detail.listing.status ?? "—"}</span>
                    <span>
                      Vendeur :{" "}
                      {detail.seller.displayName ||
                        detail.seller.username ||
                        "—"}
                    </span>
                  </div>
                  {detail.listing.error ? (
                    <p className="mt-2 text-warning">{detail.listing.error}</p>
                  ) : null}
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                  {detail.messages.map((message, index) => {
                    const mine = message.isFromSeller;
                    return (
                      <div
                        key={
                          message.messageId ?? `${index}-${message.createdDate}`
                        }
                        className={cn(
                          "flex w-full",
                          mine ? "justify-end" : "justify-start",
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                            mine
                              ? "rounded-br-md bg-zinc-900 text-white"
                              : "rounded-bl-md border border-zinc-200 bg-white text-zinc-900",
                          )}
                        >
                          <div
                            className={cn(
                              "mb-1 text-[11px] font-semibold",
                              mine ? "text-zinc-300" : "text-amber-700",
                            )}
                          >
                            {mine
                              ? `Vous (${message.senderUsername ?? detail.seller.username ?? "?"})`
                              : `Client (${message.senderUsername ?? detail.buyer})`}
                            <span className="ml-2 font-normal opacity-80">
                              {message.dateLabel}
                            </span>
                          </div>
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {message.body}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : null}
          </CardBody>
        </Card>

        {/* AI panel */}
        <Card className="flex min-h-[28rem] flex-col overflow-hidden">
          <CardHeader
            title="Réponse IA"
            description="AI Engine · édition humaine avant envoi"
          />
          <CardBody className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={!editing}
              placeholder={
                selectedId
                  ? "Cliquez sur Générer pour proposer une réponse…"
                  : "Sélectionnez d’abord une conversation"
              }
              className={cn(
                "min-h-48 w-full flex-1 resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none ring-zinc-300 focus:ring-2",
                !editing && "bg-muted-bg/50",
              )}
            />

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={onGenerate}
                disabled={!selectedId || generatePending}
              >
                {generatePending ? <Spinner className="border-t-white" /> : null}
                Générer
              </Button>
              <Button
                size="sm"
                onClick={onGenerate}
                disabled={!selectedId || generatePending || !generation}
              >
                Régénérer
              </Button>
              <Button
                size="sm"
                onClick={() => setEditing(true)}
                disabled={!draft}
              >
                Modifier
              </Button>
              <Button size="sm" onClick={onCopy} disabled={!draft.trim()}>
                Copier
              </Button>
              <Button
                size="sm"
                variant="danger"
                onClick={onSend}
                disabled={!selectedId || !draft.trim() || sendPending}
              >
                {sendPending ? <Spinner /> : null}
                Envoyer
              </Button>
            </div>

            <div className="rounded-lg border border-border">
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium"
                onClick={() => setDebugOpen((v) => !v)}
              >
                <span>Prompt développeur</span>
                <span className="text-muted">{debugOpen ? "Masquer" : "Afficher"}</span>
              </button>
              {debugOpen ? (
                <div className="space-y-3 border-t border-border px-3 py-3 text-xs text-muted">
                  {!generation ? (
                    <p>Générez une réponse pour inspecter le prompt.</p>
                  ) : (
                    <>
                      <DebugBlock label="Modèle" value={generation.model} />
                      <DebugBlock
                        label="Temps"
                        value={`${generation.latencyMs} ms`}
                      />
                      <DebugBlock
                        label="Tokens"
                        value={
                          generation.tokenUsage?.totalTokens !== undefined
                            ? `prompt=${generation.tokenUsage.promptTokens ?? "?"} · completion=${generation.tokenUsage.completionTokens ?? "?"} · total=${generation.tokenUsage.totalTokens}`
                            : "—"
                        }
                      />
                      <DebugBlock
                        label="Intention"
                        value={`${generation.intentLabel}${generation.listingAnswerability ? ` · ${generation.listingAnswerability}` : ""}`}
                      />
                      <DebugBlock
                        label="Prompt système"
                        value={generation.systemPrompt}
                        pre
                      />
                      <DebugBlock
                        label="Prompt utilisateur / contexte"
                        value={generation.userPrompt}
                        pre
                      />
                      <DebugBlock
                        label="Seller Profile"
                        value={generation.sellerProfileJson}
                        pre
                      />
                      <DebugBlock
                        label="Conversations RAG"
                        value={generation.ragSummary}
                        pre
                      />
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function DebugBlock({
  label,
  value,
  pre,
}: {
  label: string;
  value: string;
  pre?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 font-medium text-foreground">{label}</div>
      {pre ? (
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md bg-muted-bg p-2 text-[11px] text-foreground/80">
          {value}
        </pre>
      ) : (
        <div className="text-foreground/80">{value}</div>
      )}
    </div>
  );
}
