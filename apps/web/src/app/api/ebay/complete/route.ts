import { NextResponse } from "next/server";
import { getOptionalUser, isAuthEnforced } from "@/server/auth";
import { completeEbayOAuthWithCode } from "@/server/ebayOAuthComplete";
import { ensureServerEnv } from "@/server/env";

/**
 * Fallback when eBay stays on ThirdPartyAuthSucessFailure instead of redirecting.
 * User pastes the full eBay URL (or just the code= value).
 */
export async function POST(request: Request) {
  ensureServerEnv();

  if (!isAuthEnforced()) {
    return NextResponse.json(
      { ok: false, error: "Auth Supabase non configurée" },
      { status: 400 },
    );
  }

  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 });
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
