"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { EbayConnectionPublic } from "@/server/ebaySession";

type Props = {
  connection: EbayConnectionPublic;
  authConfigured: boolean;
  flash?: { type: "ok" | "error"; text: string } | null;
};

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("fr-FR");
}

export function ConnectionsPanel({
  connection,
  authConfigured,
  flash,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<
    "test" | "disconnect" | "refresh" | "paste" | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pasteValue, setPasteValue] = useState("");

  async function post(path: string, kind: typeof busy) {
    setBusy(kind);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        username?: string | null;
      };
      if (!res.ok || !data.ok) {
        setError(data.error || "Action échouée");
        return;
      }
      if (kind === "test") {
        setNotice(
          data.username
            ? `Connexion OK — compte ${data.username}`
            : "Connexion eBay OK",
        );
      } else if (kind === "disconnect") {
        setNotice("Compte eBay déconnecté");
      } else {
        setNotice("Token rafraîchi");
      }
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setBusy(null);
    }
  }

  async function submitPaste() {
    setBusy("paste");
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/ebay/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urlOrCode: pasteValue }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        username?: string | null;
      };
      if (!res.ok || !data.ok) {
        setError(data.error || "Échange du code échoué");
        return;
      }
      setNotice(
        data.username
          ? `eBay connecté — ${data.username}`
          : "eBay connecté",
      );
      setPasteValue("");
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {flash ? (
        <p
          className={`text-sm ${flash.type === "ok" ? "text-emerald-700" : "text-danger"}`}
        >
          {flash.text}
        </p>
      ) : null}

      <Card>
        <CardHeader
          title="eBay"
          description="Liaison OAuth pour Message API (tokens chiffrés en base)."
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={connection.connected ? "success" : "warning"}>
              {connection.connected ? "Connecté" : "Non connecté"}
            </Badge>
            {connection.username ? (
              <span className="text-sm font-medium">{connection.username}</span>
            ) : null}
          </div>

          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Expire</dt>
              <dd>{formatDate(connection.expiresAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Dernier test</dt>
              <dd>{formatDate(connection.lastTestedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Dernière sync</dt>
              <dd>{formatDate(connection.lastSyncAt)}</dd>
            </div>
          </dl>

          <div className="flex flex-wrap gap-2">
            <a href="/api/ebay/connect">
              <Button
                type="button"
                variant="primary"
                disabled={!authConfigured}
              >
                {connection.connected ? "Reconnecter eBay" : "Connecter eBay"}
              </Button>
            </a>
            <Button
              type="button"
              disabled={busy !== null || !connection.connected}
              onClick={() => post("/api/ebay/test", "test")}
            >
              {busy === "test" ? "Test…" : "Tester"}
            </Button>
            <Button
              type="button"
              disabled={busy !== null || !connection.connected || !authConfigured}
              onClick={() => post("/api/ebay/refresh", "refresh")}
            >
              {busy === "refresh" ? "Refresh…" : "Rafraîchir token"}
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={busy !== null || !connection.connected || !authConfigured}
              onClick={() => post("/api/ebay/disconnect", "disconnect")}
            >
              {busy === "disconnect" ? "…" : "Déconnecter"}
            </Button>
          </div>

          {notice ? <p className="text-xs text-emerald-700">{notice}</p> : null}
          {error ? <p className="text-xs text-danger">{error}</p> : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Coller le code eBay"
          description="Si eBay reste sur ThirdPartyAuthSucessFailure : copie l’URL complète de cette page ici (le code expire en ~5 min)."
        />
        <CardBody className="space-y-3">
          <textarea
            className="w-full rounded-lg border border-border bg-card px-3 py-2 font-mono text-xs outline-none ring-accent focus:ring-2"
            rows={4}
            placeholder="https://auth2.ebay.com/oauth2/ThirdPartyAuthSucessFailure?isAuthSuccessful=true&code=..."
            value={pasteValue}
            onChange={(e) => setPasteValue(e.target.value)}
          />
          <Button
            type="button"
            variant="primary"
            disabled={!authConfigured || busy !== null || !pasteValue.trim()}
            onClick={() => void submitPaste()}
          >
            {busy === "paste" ? "Échange…" : "Valider le code"}
          </Button>
        </CardBody>
      </Card>
    </div>
  );
}
