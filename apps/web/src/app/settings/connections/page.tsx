import { ConnectionsPanel } from "@/features/settings/connections-panel";
import { isAuthEnforced } from "@/server/auth";
import { getCurrentEbayConnection } from "@/server/ebaySession";
import { ensureServerEnv } from "@/server/env";

export const dynamic = "force-dynamic";

type Props = {
  searchParams?: Promise<{ connected?: string; error?: string }>;
};

export default async function ConnectionsPage({ searchParams }: Props) {
  ensureServerEnv();
  const params = searchParams ? await searchParams : {};
  const connection = await getCurrentEbayConnection();
  // OAuth-per-user needs app login; SKIP_AUTH uses server token instead
  const authConfigured = isAuthEnforced();

  let flash: { type: "ok" | "error"; text: string } | null = null;
  if (params.connected === "1") {
    flash = { type: "ok", text: "Compte eBay connecté avec succès." };
  } else if (params.error) {
    flash = { type: "error", text: `Échec OAuth : ${params.error}` };
  }

  return (
    <ConnectionsPanel
      connection={connection}
      authConfigured={authConfigured}
      flash={flash}
    />
  );
}
