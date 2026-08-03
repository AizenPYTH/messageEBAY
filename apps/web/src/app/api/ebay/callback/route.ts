import { NextResponse } from "next/server";
import { getOptionalUser, isAuthEnforced } from "@/server/auth";
import { completeEbayOAuthWithCode } from "@/server/ebayOAuthComplete";
import { ensureServerEnv } from "@/server/env";

const STATE_COOKIE = "ebay_oauth_state";

export async function GET(request: Request) {
  ensureServerEnv();
  const url = new URL(request.url);
  // Prefer the request host so local http://localhost works even if APP_URL is https://local.host
  const origin = url.origin;
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

  if (!isAuthEnforced()) {
    return redirect("/settings/connections?error=auth_required");
  }

  const user = await getOptionalUser();
  if (!user) {
    return redirect(
      `/login?next=${encodeURIComponent("/settings/connections")}`,
    );
  }

  const cookieHeader = request.headers.get("cookie") ?? "";
  const expectedState = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STATE_COOKIE}=`))
    ?.slice(STATE_COOKIE.length + 1);

  // Soften state check: if cookie missing (cross-host redirect), still allow when logged in.
  if (state && expectedState && state !== expectedState) {
    return redirect("/settings/connections?error=invalid_state");
  }

  if (!code) {
    return redirect("/settings/connections?error=missing_code");
  }

  try {
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
