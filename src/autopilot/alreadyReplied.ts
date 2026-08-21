import type { EbayMessage } from "../ebay/messageApi.js";
import { isFromSelf, sameUsername } from "../conversations/messageSides.js";

const OUR_SIGNATURE = /cordialement\s*,?\s*snowolf/i;

function messageTime(message: EbayMessage | undefined): number {
  if (!message?.createdDate) return 0;
  const t = Date.parse(message.createdDate);
  return Number.isFinite(t) ? t : 0;
}

export function sortChronological(messages: EbayMessage[]): EbayMessage[] {
  return [...messages].sort((a, b) => messageTime(a) - messageTime(b));
}

/** Strip greeting / signature so identical auto-replies match. */
export function normalizeReplyBody(text: string | undefined): string {
  return (text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(OUR_SIGNATURE, "")
    .replace(/^\s*(bonjour|bonsoir|hello|hi)\s*,?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function looksLikeOurSellerReply(text: string | undefined): boolean {
  const raw = text?.trim() ?? "";
  if (!raw) return false;
  if (OUR_SIGNATURE.test(raw)) return true;
  if (/vous confirmez l['’]?annulation\s*\?/i.test(raw)) return true;
  if (/do you confirm the cancellation\s*\?/i.test(raw)) return true;
  return false;
}

export function isNearDuplicateReply(
  a: string | undefined,
  b: string | undefined,
): boolean {
  const left = normalizeReplyBody(a);
  const right = normalizeReplyBody(b);
  if (!left || !right) return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (shorter.length >= 40 && longer.includes(shorter)) return true;
  if (shorter.length < 60) return false;
  if (
    /conformit/i.test(left) &&
    /conformit/i.test(right) &&
    /grade/i.test(left) &&
    /grade/i.test(right)
  ) {
    return true;
  }
  if (/flexgate/i.test(left) && /flexgate/i.test(right)) {
    return true;
  }
  if (
    /d[ée]sol[eé].{0,120}probl/i.test(left) &&
    /d[ée]sol[eé].{0,120}probl/i.test(right) &&
    shorter.length >= 80
  ) {
    return true;
  }
  const tok = (s: string) =>
    new Set(s.split(" ").filter((w) => w.length >= 4));
  const aSet = tok(left);
  const bSet = tok(right);
  if (aSet.size === 0 || bSet.size === 0) return false;
  let inter = 0;
  for (const w of aSet) {
    if (bSet.has(w)) inter += 1;
  }
  const union = aSet.size + bSet.size - inter;
  return union > 0 && inter / union >= 0.55;
}

function isOurMessage(
  message: EbayMessage,
  selfUsernames: Array<string | undefined>,
): boolean {
  if (
    selfUsernames.some((name) =>
      isFromSelf({ senderUsername: message.senderUsername, selfUsername: name }),
    )
  ) {
    return true;
  }
  return looksLikeOurSellerReply(message.messageBody);
}

/**
 * True when we already answered and the other party has not written since.
 * Catches username mismatches: SNOWOLF-signed messages count as ours.
 */
export function alreadyRepliedAwaitingBuyer(input: {
  messages: EbayMessage[];
  selfUsernames: Array<string | undefined>;
}): boolean {
  const chronological = sortChronological(input.messages).filter((m) =>
    Boolean(m.messageBody?.trim()),
  );
  if (chronological.length === 0) return false;

  const last = chronological[chronological.length - 1]!;
  return isOurMessage(last, input.selfUsernames);
}

/** How many of our replies sit after the last real incoming message. */
export function ourRepliesSinceIncoming(input: {
  messages: EbayMessage[];
  selfUsernames: Array<string | undefined>;
}): number {
  const chronological = sortChronological(input.messages).filter((m) =>
    Boolean(m.messageBody?.trim()),
  );
  let count = 0;
  for (let i = chronological.length - 1; i >= 0; i -= 1) {
    const m = chronological[i]!;
    if (isOurMessage(m, input.selfUsernames)) {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

export function draftAlreadySentInThread(input: {
  draft: string;
  messages: EbayMessage[];
}): boolean {
  const draft = input.draft.trim();
  if (!draft) return false;
  const recent = sortChronological(input.messages).slice(-12);
  return recent.some((m) => isNearDuplicateReply(m.messageBody, draft));
}

/**
 * First real message is from us → we contacted them (other seller / their listing).
 * Autopilot must stay silent.
 */
export function weInitiatedContact(input: {
  messages: EbayMessage[];
  selfUsernames: Array<string | undefined>;
}): boolean {
  const first = sortChronological(input.messages).find((m) =>
    Boolean(m.messageBody?.trim()),
  );
  if (!first) return false;
  return isOurMessage(first, input.selfUsernames);
}

export function isForeignSellerListing(input: {
  authUsername?: string;
  listingSeller?: string;
}): boolean {
  const auth = input.authUsername?.trim();
  const seller = input.listingSeller?.trim();
  if (!auth || !seller) return false;
  return !sameUsername(auth, seller);
}
