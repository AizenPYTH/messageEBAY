import { NextResponse } from "next/server";
import { resolveActor } from "@/server/auth";
import { completeEbayOAuthWithCode } from "@/server/ebayOAuthComplete";
import { isEbayLinkReady } from "@/server/guestSession";
import { ensureServerEnv } from "@/server/env";

/**
 * Fallback when eBay stays on ThirdPartyAuthSucessFailure instead of redirecting.
 */
export async function POST(request: Request) {
  ensureServerEnv();

  if (!isEbayLinkReady()) {
    return NextResponse.json(
      { ok: false, error: "OAuth eBay non configuré (credentials / TOKEN_ENCRYPTION_KEY)" },
      { status: 400 },
    );
  }

  let body: { urlOrCode?: string };
  try {
    body = (await request.json()) as { urlOrCode?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 });
  }

  const urlOrCode = body.urlOrCode?.trim();
  if (!urlOrCode) {
    return NextResponse.json(
      { ok: false, error: "Collez l’URL eBay ou le code" },
      { status: 400 },
    );
  }

  try {
    const user = await resolveActor();
    const result = await completeEbayOAuthWithCode(user, urlOrCode);
    return NextResponse.json({ ok: true, username: result.username ?? null });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Échange OAuth échoué",
      },
      { status: 500 },
    );
  }
}
