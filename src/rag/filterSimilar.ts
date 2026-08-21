import type { SimilarConversationExample } from "./types.js";

const POLLUTION_PATTERNS: RegExp[] = [
  /\bpaypal\b/i,
  /\bpay\s*pal\b/i,
  /\blitige\b/i,
  /\bdispute\b/i,
  /\bobjet\s+non\s+re[cç]u\b/i,
  /\bitem\s+not\s+received\b/i,
  /\bwestern\s+union\b/i,
  /\bvirement\b/i,
  /\bhors\s+ebay\b/i,
  /\bremboursement\s+(complet|int[ée]gral|total)\b/i,
  /\bbordereau\b/i,
];

const MIN_SCORE = 0.35;

function textLooksPolluted(text: string | null | undefined): boolean {
  const raw = text?.trim() ?? "";
  if (!raw) return false;
  return POLLUTION_PATTERNS.some((re) => re.test(raw));
}

/**
 * Keep RAG as style hints only: drop dispute/PayPal/return threads and weak matches.
 */
export function filterSimilarForStyle(input: {
  examples: SimilarConversationExample[];
  buyerText?: string;
  max?: number;
}): SimilarConversationExample[] {
  const buyerAllowsPollution = textLooksPolluted(input.buyerText);
  const max = input.max ?? 3;

  return input.examples
    .filter((ex) => (ex.score ?? 0) >= MIN_SCORE)
    .filter((ex) => {
      if (buyerAllowsPollution) return true;
      return (
        !textLooksPolluted(ex.clientQuestion) &&
        !textLooksPolluted(ex.sellerReply)
      );
    })
    .slice(0, max);
}
