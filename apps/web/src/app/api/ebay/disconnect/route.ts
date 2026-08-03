import { NextResponse } from "next/server";
import { disconnectEbay } from "@/server/core";
import { resolveActor } from "@/server/auth";
import { isEbayLinkReady } from "@/server/guestSession";
import { ensureServerEnv } from "@/server/env";

export async function POST() {
  ensureServerEnv();

  if (!isEbayLinkReady()) {
    return NextResponse.json(
      { ok: false, error: "OAuth eBay non configuré" },
      { status: 400 },
    );
  }

  try {
    const user = await resolveActor();
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
