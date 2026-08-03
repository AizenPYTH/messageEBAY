import { ConnectionsPanel } from "@/features/settings/connections-panel";
import { isEbayLinkReady } from "@/server/guestSession";
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
  const ebayLinkReady = isEbayLinkReady();

  let flash: { type: "ok" | "error"; text: string } | null = null;
  if (params.connected === "1") {
    flash = { type: "ok", text: "Compte eBay connecté avec succès sur ce navigateur." };
  } else if (params.error) {
    flash = { type: "error", text: `Échec OAuth : ${params.error}` };
  }

  return (
    <ConnectionsPanel
      connection={connection}
      authConfigured={ebayLinkReady}
      flash={flash}
    />
  );
}
