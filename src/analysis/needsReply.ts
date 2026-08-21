/**
 * Detect client messages that do not require a seller reply
 * (thanks, goodbye, short acknowledgements / greetings without a question).
 */
const NO_REPLY_PATTERNS: RegExp[] = [
  /^(bonjour|bonsoir|salut|hello|hi|hey)\s*[!.…]*$/i,
  /^(merci|thanks|thank you|gracias|thx|ty)\b/i,
  /\bmerci\b.*\b(beaucoup|bien|pour|bonne)\b/i,
  /\b(bonne\s+(journ[ée]e|soir[ée]e|nuit|continuation|route)|bon\s+week-?end)\b/i,
  /\b(have a (nice|good) (day|evening|one))\b/i,
  /^(ok|okay|oké|d['’]?accord|parfait|super|top|nickel|cool|great|noted|bien reçu|reçu|compris)(\s+(ok|okay|parfait|super|top|nickel|cool|merci))*\s*[!.…]*$/i,
  /^(au revoir|à bientôt|a bientôt|bye|goodbye|cordialement|cdt|bien à vous)\b/i,
  /^[👍🙏😊🙂😉✨❤️♥️]+$/u,
];

const COURTESY_CLOSE: RegExp[] = [
  /j['’]attends/i,
  /avec impatience/i,
  /tr[eè]s bien/i,
  /je n['’]en doute pas/i,
  /[eé]valuation/i,
  /parfait\s*[.!]?\s*merci/i,
];

export function isNoReplyNeeded(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return true;

  // Real question → always needs a reply.
  if (raw.includes("?")) return false;

  if (COURTESY_CLOSE.some((re) => re.test(raw))) return true;

  // Keep short only — long messages with substance still need attention.
  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length > 18) return false;

  return NO_REPLY_PATTERNS.some((re) => re.test(raw));
}

/** Client wrote last AND the message actually needs a seller answer. */
export function clientNeedsReply(input: {
  lastSenderIsClient: boolean;
  lastMessageText?: string;
}): boolean {
  if (!input.lastSenderIsClient) return false;
  return !isNoReplyNeeded(input.lastMessageText);
}
