/**
 * Buyers we never auto-reply to (explicit mute).
 * Usernames compared case-insensitively.
 */
const MUTED_BUYERS = new Set(["nylwn"]);

export function isMutedBuyer(username: string | undefined): boolean {
  const key = username?.trim().toLowerCase();
  if (!key) return false;
  return MUTED_BUYERS.has(key);
}
