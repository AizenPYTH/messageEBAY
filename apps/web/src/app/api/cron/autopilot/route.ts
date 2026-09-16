import { NextResponse } from "next/server";
import { runAutopilotAll } from "@/server/core";
import { ensureServerEnv } from "@/server/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

async function handle(request: Request): Promise<Response> {
  if (!authorize(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const enabled = (process.env.AUTOPILOT_ENABLED ?? "").trim().toLowerCase();
  if (["0", "false", "off", "no", "non"].includes(enabled)) {
    return NextResponse.json({
      ok: true,
      disabled: true,
      sent: 0,
      alerted: 0,
      errors: 0,
      processed: 0,
      users: 0,
      detail: "Autopilot désactivé (AUTOPILOT_ENABLED=false)",
    });
  }

  try {
    ensureServerEnv();
    const result = await runAutopilotAll({ limitPerUser: 200 });
    const totals = result.users.reduce(
      (acc, u) => {
        acc.sent += u.sent;
        acc.alerted += u.alerted;
        acc.errors += u.errors;
        acc.processed += u.processed;
        return acc;
      },
      { sent: 0, alerted: 0, errors: 0, processed: 0 },
    );
    return NextResponse.json({
      ok: true,
      ...totals,
      users: result.users.length,
      // Which profiles actually sent — a shop with several browser cookies can
      // own several profiles, and turning the toggle off in one leaves the
      // others running.
      activeProfiles: result.users.map((u) => u.userId),
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      details: result.users,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "autopilot failed",
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
