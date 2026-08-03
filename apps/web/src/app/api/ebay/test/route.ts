import { NextResponse } from "next/server";
import {
  getAuthenticatedUsername,
  listConversations,
  markEbayConnectionTested,
} from "@/server/core";
import { getOptionalUser, resolveActor } from "@/server/auth";
import { withEbayContext } from "@/server/ebaySession";
import { ensureServerEnv } from "@/server/env";

export async function POST() {
  ensureServerEnv();

  try {
    const result = await withEbayContext(async () => {
      const username = await getAuthenticatedUsername();
      await listConversations("FROM_MEMBERS", 1);
      return { username };
    });

    try {
      const user = (await getOptionalUser()) ?? (await resolveActor());
      await markEbayConnectionTested(user.id);
    } catch {
      // optional
    }

    return NextResponse.json({
      ok: true,
      username: result.username ?? null,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Test eBay échoué",
      },
      { status: 500 },
    );
  }
}
