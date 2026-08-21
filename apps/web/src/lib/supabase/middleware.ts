import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isAuthSkipped } from "@/lib/auth-mode";
import {
  GUEST_COOKIE,
  ensureGuestIdFromRequestCookie,
  guestCookieOptions,
} from "@/lib/guest-cookie";
import {
  getPublicSupabaseAnonKey,
  getPublicSupabaseUrl,
  isSupabaseAuthConfigured,
} from "@/lib/supabase/env";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // Testing mode: no login gate — but keep a stable guest cookie for eBay OAuth.
  if (isAuthSkipped() || !isSupabaseAuthConfigured()) {
    if (isAuthSkipped()) {
      const guestId = ensureGuestIdFromRequestCookie(
        request.cookies.get(GUEST_COOKIE)?.value,
      );
      // So RSC / route handlers see the same id on this request.
      request.cookies.set(GUEST_COOKIE, guestId);
      supabaseResponse.cookies.set(GUEST_COOKIE, guestId, guestCookieOptions);
    }
    return supabaseResponse;
  }

  const url = getPublicSupabaseUrl()!;
  const key = getPublicSupabaseAnonKey()!;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        supabaseResponse = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          supabaseResponse.cookies.set(name, value, options);
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic =
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth") ||
    pathname.startsWith("/api/ebay/callback");

  if (!user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && pathname === "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/dashboard";
    redirectUrl.search = "";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
