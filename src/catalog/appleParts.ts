/**
 * Detect Apple Mac part numbers (A2338, A1466, …) in buyer messages.
 */

const APPLE_PART_RE = /\bA\d{4}[A-Z]?\b/gi;

export function extractApplePartNumbers(message: string): string[] {
  const found = message.match(APPLE_PART_RE) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of found) {
    const id = raw.toUpperCase();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Title lists many Apple models without being a single dedicated SKU. */
export function titleIsMultiAppleModel(title: string): boolean {
  const parts = title.match(APPLE_PART_RE) ?? [];
  const unique = new Set(parts.map((p) => p.toUpperCase()));
  return unique.size >= 3;
}

/** True if title is clearly about screens / LCD. */
export function titleLooksLikeScreen(title: string): boolean {
  return /\b(écran|ecran|lcd|display)\b/i.test(title);
}

export function messageAsksScreen(message: string): boolean {
  return /\b(écran|ecran|lcd|display)\b/i.test(message);
}

export type AskedFinish = {
  color?: "gris" | "argent";
  grade?: "a" | "b";
};

function hay(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function extractAskedFinish(text: string | undefined): AskedFinish {
  const n = hay(text ?? "");
  const out: AskedFinish = {};
  if (/\b(gris|gray|grey|sideral|space\s*gr[ae]y)\b/.test(n)) out.color = "gris";
  else if (/\b(argente?|silver)\b/.test(n)) out.color = "argent";
  const g = n.match(/\bgrade\s*([ab])\b/);
  if (g?.[1] === "a" || g?.[1] === "b") out.grade = g[1];
  return out;
}

export function listingFinish(title: string | undefined): AskedFinish {
  return extractAskedFinish(title ?? "");
}

/** Buyer asks another color/grade than the conversation listing. */
export function askedFinishDiffersFromListing(
  message: string | undefined,
  listingTitle: string | undefined,
): boolean {
  const asked = extractAskedFinish(message);
  if (!asked.color && !asked.grade) return false;
  const have = listingFinish(listingTitle);
  if (asked.color && have.color && asked.color !== have.color) return true;
  if (asked.grade && have.grade && asked.grade !== have.grade) return true;
  return false;
}

/** True if variation SKU/specifics mention this Apple part. */
export function variationMentionsApplePart(
  variation: {
    sku?: string | null;
    specifics?: Array<{ name: string; value: string }> | null;
  },
  part: string,
): boolean {
  const n = hay(
    `${variation.sku ?? ""} ${(variation.specifics ?? [])
      .map((s) => `${s.name} ${s.value}`)
      .join(" ")}`,
  );
  return n.includes(part.toLowerCase());
}
