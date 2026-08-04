"use client";

import { useState, useTransition } from "react";
import { trainFromHistoryAction } from "@/app/train/actions";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export function TrainPanel() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    conversationsFound: number;
    conversationsSynced: number;
    messagesSaved: number;
    embeddingsCreated: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onTrain() {
    setError(null);
    setResult(null);
    startTransition(async () => {
      const res = await trainFromHistoryAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult(res.data);
    });
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Card>
        <CardHeader
          title="Entraîner l’assistant"
          description="On récupère vos anciennes conversations eBay pour que l’IA apprenne votre façon de répondre."
        />
        <CardBody className="space-y-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
            <li>Connectez votre compte eBay (menu Compte eBay).</li>
            <li>Cliquez sur le bouton ci-dessous.</li>
            <li>Attendez la fin — puis retournez dans Messages pour répondre.</li>
          </ol>

          <Button
            type="button"
            variant="primary"
            className="w-full"
            disabled={pending}
            onClick={onTrain}
          >
            {pending ? <Spinner className="border-t-white" /> : null}
            {pending
              ? "Import en cours… (1–2 min)"
              : "Importer mes anciennes conversations"}
          </Button>

          <p className="text-xs text-muted">
            Rien n’est envoyé automatiquement aux clients. On enregistre
            seulement l’historique pour améliorer les suggestions.
          </p>

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          {result ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900">
              <p className="font-medium">Import terminé</p>
              <ul className="mt-2 space-y-1 text-xs">
                <li>Conversations trouvées : {result.conversationsFound}</li>
                <li>Conversations importées : {result.conversationsSynced}</li>
                <li>Messages enregistrés : {result.messagesSaved}</li>
                <li>Exemples appris par l’IA : {result.embeddingsCreated}</li>
              </ul>
              {result.errors.length > 0 ? (
                <p className="mt-2 text-xs text-amber-800">
                  Quelques avertissements : {result.errors[0]}
                </p>
              ) : null}
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
