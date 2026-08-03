"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { saveSellerProfileAction } from "@/app/seller-profile/actions";
import type { SellerProfileFormDto } from "@/server/sellerProfile";

type Props = {
  initial: SellerProfileFormDto | null;
  loadError?: string;
};

export function SellerProfileForm({ initial, loadError }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError ?? null);

  if (!form) {
    return (
      <Card>
        <CardHeader
          title="Aucun compte eBay"
          description="Connectez eBay pour éditer le profil vendeur."
        />
        <CardBody>
          <a href="/settings/connections">
            <Button variant="primary">Aller aux connexions</Button>
          </a>
          {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
        </CardBody>
      </Card>
    );
  }

  function update<K extends keyof SellerProfileFormDto>(
    key: K,
    value: SellerProfileFormDto[K],
  ) {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setNotice(null);
    setError(null);
    const result = await saveSellerProfileAction({
      username: form.username,
      displayName: form.displayName,
      languages: form.languages,
      responseStyle: form.responseStyle,
      shippingPolicy: form.shippingPolicy,
      returnPolicy: form.returnPolicy,
      refundPolicy: form.refundPolicy,
      negotiationPolicy: form.negotiationPolicy,
      tone: form.tone,
      signature: form.signature,
      customInstructions: form.customInstructions,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice("Profil enregistré.");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Card>
        <CardHeader
          title={`Profil — ${form.username}`}
          description="Persistant dans ebay_ai.seller_profiles"
        />
        <CardBody className="grid gap-3 md:grid-cols-2">
          <Field
            label="Nom affiché"
            value={form.displayName}
            onChange={(v) => update("displayName", v)}
          />
          <Field
            label="Langues (séparées par virgule)"
            value={form.languages}
            onChange={(v) => update("languages", v)}
          />
          <Field
            label="Ton"
            value={form.tone}
            onChange={(v) => update("tone", v)}
            hint="ex. vouvoiement / tutoiement"
          />
          <div className="md:col-span-2">
            <Field
              label="Style de réponse"
              value={form.responseStyle}
              onChange={(v) => update("responseStyle", v)}
              multiline
            />
          </div>
          <Field
            label="Politique livraison"
            value={form.shippingPolicy}
            onChange={(v) => update("shippingPolicy", v)}
            multiline
          />
          <Field
            label="Politique retours"
            value={form.returnPolicy}
            onChange={(v) => update("returnPolicy", v)}
            multiline
          />
          <Field
            label="Politique remboursement"
            value={form.refundPolicy}
            onChange={(v) => update("refundPolicy", v)}
            multiline
          />
          <Field
            label="Politique négociation"
            value={form.negotiationPolicy}
            onChange={(v) => update("negotiationPolicy", v)}
            multiline
          />
          <div className="md:col-span-2">
            <Field
              label="Signature"
              value={form.signature}
              onChange={(v) => update("signature", v)}
              multiline
            />
          </div>
          <div className="md:col-span-2">
            <Field
              label="Instructions personnalisées"
              value={form.customInstructions}
              onChange={(v) => update("customInstructions", v)}
              multiline
              rows={6}
            />
          </div>
        </CardBody>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="primary" disabled={saving}>
          {saving ? "Enregistrement…" : "Enregistrer"}
        </Button>
        {notice ? <p className="text-xs text-emerald-700">{notice}</p> : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  hint?: string;
}) {
  const className =
    "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2";
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-medium text-muted">{label}</span>
      {multiline ? (
        <textarea
          className={className}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          className={className}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {hint ? <span className="block text-[11px] text-muted">{hint}</span> : null}
    </label>
  );
}
