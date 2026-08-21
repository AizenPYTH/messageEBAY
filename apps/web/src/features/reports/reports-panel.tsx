"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  listReportsAction,
  resolveReportAction,
} from "@/app/reports/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import type { SellerAlertDto } from "@/server/reports";

export function ReportsPanel() {
  const [items, setItems] = useState<SellerAlertDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    startTransition(async () => {
      setError(null);
      const result = await listReportsAction();
      if (!result.ok) {
        setError(result.error);
        setItems([]);
        return;
      }
      setItems(result.data);
    });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const actionItems = useMemo(
    () => items.filter((item) => item.needsAction),
    [items],
  );
  const followUps = useMemo(
    () => items.filter((item) => !item.needsAction),
    [items],
  );

  function onResolve(id: string) {
    setResolvingId(id);
    startTransition(async () => {
      const result = await resolveReportAction(id);
      setResolvingId(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((prev) => prev.filter((item) => item.id !== id));
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 fade-in">
      <Card>
        <CardHeader
          title="Cas à suivre"
          description="Résumé de ce qui se passe avec chaque acheteur — pas le dernier message brut"
          action={
            <Button size="sm" variant="ghost" onClick={refresh} disabled={pending}>
              {pending ? <Spinner /> : null}
              Actualiser
            </Button>
          }
        />
        <CardBody className="space-y-2 text-sm text-[var(--text-secondary)]">
          <p>
            Photos, bordereau, litige… → aucune réponse auto, une alerte ici.
            Article cher cassé → proposition de geste 10 % possible ; s’il refuse
            et veut un retour → alerte.
          </p>
          {error ? (
            <p className="text-[var(--warning)]">{error}</p>
          ) : null}
        </CardBody>
      </Card>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          À traiter ({actionItems.length})
        </h2>
        {actionItems.length === 0 && !pending ? (
          <EmptyState text="Aucun cas à traiter." />
        ) : null}
        {actionItems.map((item) => (
          <AlertCard
            key={item.id}
            item={item}
            resolving={resolvingId === item.id}
            onResolve={onResolve}
          />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text-primary)]">
          Négociations en cours ({followUps.length})
        </h2>
        {followUps.length === 0 && !pending ? (
          <EmptyState text="Aucune négociation partielle en cours." />
        ) : null}
        {followUps.map((item) => (
          <AlertCard
            key={item.id}
            item={item}
            resolving={resolvingId === item.id}
            onResolve={onResolve}
          />
        ))}
      </section>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-medium)] px-3 py-8 text-center text-sm text-[var(--text-muted)]">
      {text}
    </p>
  );
}

function AlertCard({
  item,
  resolving,
  onResolve,
}: {
  item: SellerAlertDto;
  resolving: boolean;
  onResolve: (id: string) => void;
}) {
  return (
    <Card>
      <CardBody className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {item.buyerUsername}
              </span>
              <Badge tone={item.needsAction ? "warning" : "neutral"}>
                {item.alertTypeLabel}
              </Badge>
            </div>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              {item.listingTitle}
            </p>
          </div>
          <span className="text-[11px] text-[var(--text-muted)]">
            {item.createdLabel}
          </span>
        </div>

        <p className="text-sm font-medium text-[var(--text-primary)]">
          {item.reason}
        </p>

        {item.buyerMessage ? (
          <blockquote className="rounded-[var(--radius-md)] border border-[var(--border-light)] bg-[var(--bg-hover)] px-3 py-2 text-xs text-[var(--text-secondary)]">
            Message client : « {item.buyerMessage} »
          </blockquote>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/conversations?c=${encodeURIComponent(item.conversationId)}`}
            className="inline-flex h-8 items-center rounded-[var(--radius-md)] border border-[var(--border-medium)] px-3 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
          >
            Ouvrir
          </Link>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onResolve(item.id)}
            disabled={resolving}
          >
            {resolving ? <Spinner /> : null}
            Traité
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
