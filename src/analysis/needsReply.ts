/**
 * Detect client messages that do not require a seller reply
 * (thanks, goodbye, short acknowledgements / greetings without a question).
 */

const NO_REPLY_PATTERNS: RegExp[] = [
  /^(bonjour|bonsoir|salut|hello|hi|hey)\s*[!.…]*$/i,
  /^(merci|thanks|thank you|gracias|thx|ty)\b/i,
  /\bmerci\b.*\b(beaucoup|bien|pour|bonne|aide)\b/i,
  /\b(bonne\s+(journ[ée]e|soir[ée]e|nuit|continuation|route)|bon\s+week-?end)\b/i,
  /\b(have a (nice|good) (day|evening|one))\b/i,
  /^(ok|okay|oké|d['’]?accord|parfait|super|top|nickel|cool|great|noted|bien reçu|reçu|compris)(\s+(ok|okay|parfait|super|top|nickel|cool|merci))*\s*[!.…]*$/i,
  /^(au revoir|à bientôt|a bientôt|bye|goodbye|cordialement|cdt|bien à vous)\b/i,
  /\bno problem\b/i,
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

/** New question / order action — not a closing. */
const OPEN_REQUEST =
  /\b(avez[- ]vous|auriez[- ]vous|pouvez[- ]vous|pourriez[- ]vous|vous\s+pouvez|peux[- ]tu|as[- ]tu)\b|\b(annul|rembours|bordereau|dispo|disponible|en stock|garanti|compatible|envoyez|expédi|suivi|tracking|facture|whatsapp|t[eé]l[eé]phone)\b|\bje\s+(veux|voudrais|souhaite|prends|commande|ach[eè]te)\b|\b(can you|could you|would you|do you have|please (send|cancel|ship))\b/i;

const COURTESY_CHUNKS = [
  "merci beaucoup de salutations cordiales",
  "merci beaucoup de votre aide",
  "merci de votre aide",
  "merci pour votre aide",
  "merci pour tout",
  "merci beaucoup",
  "merci bien",
  "merci a vous",
  "thanks for your help",
  "thank you so much",
  "thank you very much",
  "thank you",
  "thanks",
  "gracias",
  "no problem",
  "pas de souci",
  "pas de probleme",
  "avec plaisir",
  "je m excuse beaucoup",
  "je m excuse",
  "excusez moi",
  "desolee",
  "desole",
  "sorry",
  "pour la confusion que j ai creee",
  "pour la confusion que j ai cree",
  "la confusion",
  "je vous en suis vraiment tres reconnaissant",
  "je vous en suis tres reconnaissant",
  "tres reconnaissant",
  "reconnaissant",
  "grateful",
  "salutations cordiales",
  "salutations",
  "cordialement",
  "bien a vous",
  "bonne journee",
  "bonne soiree",
  "bonne continuation",
  "au revoir",
  "a bientot",
  "d accord",
  "bien recu",
  "ca marche",
  "noted",
  "bonjour",
  "bonsoir",
  "salut",
  "hello",
  "okay",
  "merci",
  "parfait",
  "super",
  "nickel",
  "cool",
  "great",
  "compris",
  "recu",
  "frere",
  "brother",
  "aide",
  "help",
  "ok",
  "bye",
  "cdt",
  "thx",
].sort((a, b) => b.length - a.length);

const STOP = new Set([
  "je",
  "tu",
  "il",
  "nous",
  "vous",
  "ils",
  "en",
  "y",
  "suis",
  "es",
  "est",
  "ai",
  "as",
  "a",
  "ont",
  "de",
  "du",
  "des",
  "la",
  "le",
  "les",
  "un",
  "une",
  "que",
  "qui",
  "quoi",
  "dont",
  "et",
  "ou",
  "mais",
  "pour",
  "avec",
  "sans",
  "ce",
  "cet",
  "cette",
  "cela",
  "ca",
  "si",
  "ne",
  "pas",
  "plus",
  "tres",
  "vraiment",
  "beaucoup",
  "bien",
  "moi",
  "toi",
  "mon",
  "ma",
  "mes",
  "ton",
  "ta",
  "votre",
  "vos",
  "me",
  "te",
  "se",
  "j",
  "l",
  "d",
  "n",
  "c",
  "m",
  "s",
  "qu",
  "cree",
  "creee",
  "creee",
  "the",
  "i",
  "you",
  "to",
  "for",
  "your",
  "my",
  "and",
  "of",
  "it",
  "this",
  "that",
  "so",
  "very",
  "much",
  "lot",
]);

function hay(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Thanks / sorry / ok with no new ask left after stripping politeness. */
export function isCourtesyClosing(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return true;
  if (/\?/.test(raw)) return false;
  if (OPEN_REQUEST.test(raw)) return false;

  let n = hay(raw);
  if (!n) return true;
  for (const chunk of COURTESY_CHUNKS) {
    n = n.split(chunk).join(" ");
  }
  const leftover = n
    .split(" ")
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOP.has(w));
  return leftover.length <= 1;
}

export function isNoReplyNeeded(text: string | undefined): boolean {
  const raw = (text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return true;

  // Real question → always needs a reply.
  if (raw.includes("?")) return false;

  if (isCourtesyClosing(raw)) return true;
  if (COURTESY_CLOSE.some((re) => re.test(raw))) return true;

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
