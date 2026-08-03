import { NextResponse } from "next/server";
import { resolveEbayAccessToken } from "@/server/core";
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
