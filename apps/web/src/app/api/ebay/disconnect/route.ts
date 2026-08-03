import { NextResponse } from "next/server";
import { disconnectEbay } from "@/server/core";
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
    await disconnectEbay(user.id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Erreur déconnexion",
      },
      { status: 500 },
    );
  }
}
