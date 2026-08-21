import { NextResponse } from "next/server";
import {
  getEbayConnection,
  listAutopilotUserIds,
  syncSellerCatalogFromApi,
  withUserEbayToken,
} from "@/server/core";
import { ensureServerEnv } from "@/server/env";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function authorize(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth === `Bearer ${secret}`) return true;
  const url = new URL(request.url);
  if (url.searchParams.get("secret") === secret) return true;
  return false;
}

async function syncUser(
  userId: string,
  startPage: number,
  maxPages: number,
): Promise<Record<string, unknown>> {
  const conn = await getEbayConnection(userId);
  const username = conn?.provider_username?.trim();
  if (!username) {
    return { userId, skipped: true, reason: "no_username" };
  }

  const synced = await withUserEbayToken(userId, async () =>
    syncSellerCatalogFromApi({
      sellerUsername: username,
      startPage,
      maxPages,
    }),
  );

  return { userId, username, ...synced };
}

async function handle(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    ensureServerEnv();
    const url = new URL(request.url);
    const startPage = Number(url.searchParams.get("page") ?? "1") || 1;
    const maxPages = Math.min(
      Number(url.searchParams.get("pages") ?? "2") || 2,
      5,
    );

    const userIds = new Set(await listAutopilotUserIds());
    userIds.add("23698b22-eb03-467e-a485-e87961d17533");

    const results: Array<Record<string, unknown>> = [];
    for (const userId of userIds) {
      try {
        results.push(await syncUser(userId, startPage, maxPages));
      } catch (error: unknown) {
        results.push({
          userId,
          error: error instanceof Error ? error.message : "sync failed",
        });
      }
    }

    return NextResponse.json({ ok: true, startPage, maxPages, results });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "catalog sync failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request): Promise<Response> {
  return handle(request);
}

export async function POST(request: Request): Promise<Response> {
  return handle(request);
}
