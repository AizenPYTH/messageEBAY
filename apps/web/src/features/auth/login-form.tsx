"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

type Props = {
  configured: boolean;
  nextPath?: string;
};

export function LoginForm({ configured, nextPath = "/dashboard" }: Props) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!configured) {
      setStatus("error");
      setMessage(
        "Configurez NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      );
      return;
    }

    setStatus("sending");
    setMessage(null);

    try {
      const supabase = createClient();
      const origin = window.location.origin;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
        },
      });

      if (error) {
        setStatus("error");
        setMessage(error.message);
        return;
      }

      setStatus("sent");
      setMessage("Vérifiez votre boîte mail — un lien de connexion a été envoyé.");
    } catch (error: unknown) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Erreur d’envoi du lien",
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <label className="block space-y-1.5">
        <span className="text-xs font-medium text-muted">E-mail</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="vous@exemple.com"
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
          disabled={!configured || status === "sending"}
        />
      </label>

      <Button
        type="submit"
        variant="primary"
        className="w-full"
        disabled={!configured || status === "sending" || !email.trim()}
      >
        {status === "sending" ? "Envoi…" : "Recevoir un lien magique"}
      </Button>

      {message ? (
        <p
          className={`text-xs ${status === "error" ? "text-danger" : "text-muted"}`}
        >
          {message}
        </p>
      ) : null}
    </form>
  );
}
