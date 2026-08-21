import "server-only";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import {
  GUEST_COOKIE,
  ensureGuestIdFromRequestCookie,
  guestCookieOptions,
  isGuestUuid,
} from "@/lib/guest-cookie";
import { upsertAppProfile } from "@/server/core";
import { ensureServerEnv, hasEnv } from "@/server/env";

export type GuestUser = {
  id: string;
  email?: string;
  displayName?: string;
};

export { GUEST_COOKIE, guestCookieOptions, ensureGuestIdFromRequestCookie };

function toGuestUser(id: string): GuestUser {
  return {
    id,
    displayName: "Invité",
    email: `guest-${id.slice(0, 8)}@local`,
  };
}

/** True when eBay OAuth per browser/PC is available (no email login required). */
export function isEbayLinkReady(): boolean {
  ensureServerEnv();
  return (
    hasEnv("EBAY_CLIENT_ID") &&
    hasEnv("EBAY_CLIENT_SECRET") &&
    hasEnv("EBAY_RUNAME") &&
    hasEnv("TOKEN_ENCRYPTION_KEY")
  );
}

export async function getGuestUserIfPresent(): Promise<GuestUser | null> {
  ensureServerEnv();
  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value?.trim();
  if (!existing || !isGuestUuid(existing)) return null;
  return toGuestUser(existing);
}

/**
 * Create/persist guest identity. Call from Route Handlers only.
 * Also call applyGuestCookie(response, user.id) on the returned NextResponse.
 */
export async function getOrCreateGuestUser(): Promise<GuestUser> {
  ensureServerEnv();
  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value?.trim();
  const id =
    existing && isGuestUuid(existing)
      ? existing
      : ensureGuestIdFromRequestCookie(undefined);

  jar.set(GUEST_COOKIE, id, guestCookieOptions);

  const user = toGuestUser(id);
  await upsertAppProfile({
    id: user.id,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
  });
  return user;
}

/** Put guest id on the actual HTTP response (required for redirects in Next 15). */
export function applyGuestCookie(response: NextResponse, guestId: string): void {
  response.cookies.set(GUEST_COOKIE, guestId, guestCookieOptions);
}
