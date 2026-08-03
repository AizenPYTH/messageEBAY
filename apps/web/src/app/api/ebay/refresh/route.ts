import { NextResponse } from "next/server";
import { resolveEbayAccessToken } from "@/server/core";
import { getOptionalUser, isAuthEnforced } from "@/server/auth";
import { ensureServerEnv } from "@/server/env";

export async function POST() {
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

  try {
    const token = await resolveEbayAccessToken(user.id);
    if (!token) {
      return NextResponse.json(
        { ok: false, error: "Aucune connexion eBay" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, refreshed: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Refresh échoué",
      },
      { status: 500 },
    );
  }
}
