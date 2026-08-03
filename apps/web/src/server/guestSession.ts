import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { upsertAppProfile } from "@/server/core";
import { ensureServerEnv, hasEnv } from "@/server/env";

export type GuestUser = {
  id: string;
  email?: string;
  displayName?: string;
};

export const GUEST_COOKIE = "ebay_ai_guest_id";
const GUEST_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

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
  if (!existing || !isUuid(existing)) return null;
  return toGuestUser(existing);
}

/**
 * Create/persist guest identity. Call from Route Handlers only
 * (cookie set is reliable there).
 */
export async function getOrCreateGuestUser(): Promise<GuestUser> {
  ensureServerEnv();
  const jar = await cookies();
  const existing = jar.get(GUEST_COOKIE)?.value?.trim();
  const id = existing && isUuid(existing) ? existing : randomUUID();

  jar.set(GUEST_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_MAX_AGE,
  });

  const user = toGuestUser(id);
  await upsertAppProfile({
    id: user.id,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
  });
  return user;
}
