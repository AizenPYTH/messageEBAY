import { NextResponse } from "next/server";
import { resolveActor } from "@/server/auth";
import { completeEbayOAuthWithCode } from "@/server/ebayOAuthComplete";
import { isEbayLinkReady } from "@/server/guestSession";
import { ensureServerEnv } from "@/server/env";

const STATE_COOKIE = "ebay_oauth_state";

export async function GET(request: Request) {
  ensureServerEnv();
  const url = new URL(request.url);
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const ebayError = url.searchParams.get("error");

  const redirect = (path: string) => {
    const response = NextResponse.redirect(`${origin}${path}`);
    response.cookies.set(STATE_COOKIE, "", {
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });
    return response;
  };

  if (ebayError) {
    return redirect(`/settings/connections?error=${encodeURIComponent(ebayError)}`);
  }

  if (!isEbayLinkReady()) {
    return redirect("/settings/connections?error=oauth_not_ready");
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const expectedState = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);

  if (state && expectedState && state !== expectedState) {
    return redirect("/settings/connections?error=invalid_state");
  }

  if (!code) {
    return redirect("/settings/connections?error=missing_code");
  }

  try {
    const user = await resolveActor();
    await completeEbayOAuthWithCode(user, code);
    return redirect("/settings/connections?connected=1");
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "oauth_exchange_failed";
    return redirect(
      `/settings/connections?error=${encodeURIComponent(message.slice(0, 120))}`,
    );
  }
}
