/** Shared guest cookie helpers (safe for middleware + route handlers). */

export const GUEST_COOKIE = "ebay_ai_guest_id";
const GUEST_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export const guestCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: GUEST_MAX_AGE,
};

export function isGuestUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export function ensureGuestIdFromRequestCookie(
  existing: string | undefined,
): string {
  const trimmed = existing?.trim();
  if (trimmed && isGuestUuid(trimmed)) return trimmed;
  // crypto.randomUUID is available in Edge Runtime
  return crypto.randomUUID();
}
