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
 * "Vous" in the UI = the eBay account tied to the access token.
 * Do NOT include listing seller when it differs (test / multi-account cases
 * otherwise paint every bubble as seller).
 */
export function resolveSelfUsername(input: {
  authUsername?: string;
  listingSeller?: string;
}): string | undefined {
  return input.authUsername?.trim() || input.listingSeller?.trim() || undefined;
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
