export type MessageSide = "seller" | "client" | "unknown";

function norm(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

export function sameUsername(
  a: string | undefined,
  b: string | undefined,
): boolean {
  const left = norm(a);
  const right = norm(b);
  return Boolean(left && right && left === right);
}

/**
 * "Vous" in the UI = the eBay account tied to the access token only.
 * Never treat listing seller as self when auth is known — that painted
 * both sides as "Vous" in multi-account / test threads.
 */
export function resolveSelfUsername(input: {
  authUsername?: string;
  listingSeller?: string;
}): string | undefined {
  const auth = input.authUsername?.trim();
  if (auth) return auth;
  // Last resort only when GetUser failed (otherwise sides flip wrongly).
  return input.listingSeller?.trim() || undefined;
}

export function resolveClientUsername(input: {
  selfUsername?: string;
  otherPartyUsername?: string;
  participants: Array<string | undefined>;
}): string {
  if (
    input.otherPartyUsername?.trim() &&
    !sameUsername(input.otherPartyUsername, input.selfUsername)
  ) {
    return input.otherPartyUsername.trim();
  }

  for (const name of input.participants) {
    if (name?.trim() && !sameUsername(name, input.selfUsername)) {
      return name.trim();
    }
  }

  return "(acheteur inconnu)";
}

export function sideOfSender(input: {
  senderUsername?: string;
  selfUsername?: string;
  clientUsername?: string;
}): MessageSide {
  if (!input.senderUsername?.trim()) return "unknown";
  if (sameUsername(input.senderUsername, input.selfUsername)) return "seller";
  if (
    sameUsername(input.senderUsername, input.clientUsername) ||
    (input.selfUsername &&
      !sameUsername(input.senderUsername, input.selfUsername))
  ) {
    return "client";
  }
  return "unknown";
}

export function isFromSelf(input: {
  senderUsername?: string;
  selfUsername?: string;
}): boolean {
  return sameUsername(input.senderUsername, input.selfUsername);
}

/**
 * True when the logged-in eBay account is the listing seller.
 * When false, we are the buyer (or role unknown) — do not create seller alerts.
 */
export function isOwnListing(input: {
  authUsername?: string;
  listingSeller?: string;
}): boolean {
  return sameUsername(input.authUsername, input.listingSeller);
}

/** Latest message body only if it was sent by the other party (not us). */
export function latestIncomingBuyerText(input: {
  messages: Array<{
    senderUsername?: string;
    messageBody?: string;
    createdDate?: string;
  }>;
  selfUsername?: string;
}): string | undefined {
  const sorted = [...input.messages].sort((a, b) => {
    const ta = a.createdDate ? Date.parse(a.createdDate) : 0;
    const tb = b.createdDate ? Date.parse(b.createdDate) : 0;
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });
  for (const message of sorted) {
    if (
      isFromSelf({
        senderUsername: message.senderUsername,
        selfUsername: input.selfUsername,
      })
    ) {
      continue;
    }
    const body = message.messageBody?.trim();
    if (body) return body;
  }
  return undefined;
}
