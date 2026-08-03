import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { buildAuthorizeUrl } from "@/server/core";
import { ensureAppProfileForUser, resolveActor } from "@/server/auth";
import { isEbayLinkReady } from "@/server/guestSession";
import { ensureServerEnv } from "@/server/env";

const STATE_COOKIE = "ebay_oauth_state";
const COOKIE_MAX_AGE = 60 * 10;

export async function GET(request: Request) {
  ensureServerEnv();
  const { origin } = new URL(request.url);

  if (!isEbayLinkReady()) {
    return NextResponse.redirect(
      `${origin}/settings/connections?error=oauth_not_ready`,
    );
  }

  try {
    const user = await resolveActor();
    await ensureAppProfileForUser(user);

    const state = randomBytes(24).toString("hex");
    const authorizeUrl = buildAuthorizeUrl(state);

    const response = NextResponse.redirect(authorizeUrl);
    response.cookies.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: COOKIE_MAX_AGE,
    });
    return response;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "connect_failed";
    return NextResponse.redirect(
      `${origin}/settings/connections?error=${encodeURIComponent(message.slice(0, 120))}`,
    );
  }
}
