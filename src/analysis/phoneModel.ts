export type IphoneModel = {
  gen: string;
  pro: boolean;
  max: boolean;
  plus: boolean;
  mini: boolean;
  label: string;
};

const GEN = String.raw`(?:xs|xr|se)|x|\d{1,2}`;
const SUFFIX = String.raw`(?:\s+pro)?(?:\s+max)?(?:\s+plus)?(?:\s+mini)?`;

function hay(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/iphone(?=\d)/g, "iphone ")
    .replace(/(\d)(pro)/g, "$1 $2")
    .replace(/promax/g, "pro max")
    .replace(/[-_/]+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function fromMatch(m: RegExpMatchArray): IphoneModel {
  const gen = (m[1] ?? "").toLowerCase();
  const rest = ` ${m[2] ?? ""} `;
  const pro = /\bpro\b/.test(rest);
  const max = /\bmax\b/.test(rest);
  const plus = /\bplus\b/.test(rest);
  const mini = /\bmini\b/.test(rest);
  const bits = ["iPhone"];
  if (gen === "xr") bits.push("XR");
  else if (gen === "xs") bits.push("XS");
  else if (gen === "se") bits.push("SE");
  else if (gen === "x") bits.push("X");
  else bits.push(gen);
  if (pro) bits.push("Pro");
  if (max) bits.push("Max");
  if (plus) bits.push("Plus");
  if (mini) bits.push("Mini");
  return { gen, pro, max, plus, mini, label: bits.join(" ") };
}

/**
 * Parse "iPhone 11 Pro Max" / "11 Pro Max" / "écran iPhone 11 pro Max".
 * Pro Max is a distinct SKU from 11 and from 11 Pro.
 * Never steal Surface / MacBook / iPad model asks.
 */
export function parseIphoneModel(text: string | undefined): IphoneModel | null {
  const n = hay(text ?? "");
  if (!n) return null;
  if (/\b(surface|macbook|ipad)\b/.test(n)) return null;
  if (
    /\b(samsung|galaxy|xiaomi|redmi|huawei|honor|oppo|oneplus|pixel|motorola|nokia)\b/.test(
      n,
    )
  ) {
    return null;
  }
  if (/\ba\d{3}[a-z]\b/.test(n)) return null;

  const withName = n.match(new RegExp(`\\biphone\\s+(${GEN})(${SUFFIX})\\b`));
  if (withName) return fromMatch(withName);

  // Variation values: "11", "11 Pro Max", "11 Pro Max Noir", "XS"
  const skuStart = n.match(new RegExp(`^(${GEN})(${SUFFIX})\\b`));
  if (skuStart && n.split(" ").length <= 8) return fromMatch(skuStart);

  // "écran 11 pro max" without the word iPhone — need a suffix so
  // "écran Samsung A 13" is not stolen as iPhone 13.
  if (/\b(ecran|lcd)\b/.test(n)) {
    const inSentence = n.match(new RegExp(`\\b(${GEN})(${SUFFIX})\\b`));
    if (inSentence && (inSentence[2] ?? "").trim()) return fromMatch(inSentence);
  }

  return null;
}

/** Same generation + same suffixes. "11" ≠ "11 Pro Max". */
export function iphoneModelsEqual(a: IphoneModel, b: IphoneModel): boolean {
  return (
    a.gen === b.gen &&
    a.pro === b.pro &&
    a.max === b.max &&
    a.plus === b.plus &&
    a.mini === b.mini
  );
}

export function variationIsAskedIphone(
  asked: IphoneModel,
  variationText: string,
): boolean {
  const n = hay(variationText ?? "");
  if (!n || /\b(surface|macbook|ipad)\b/.test(n)) return false;
  const re = new RegExp(`(?:iphone\\s+)?\\b(${GEN})(${SUFFIX})\\b`, "g");
  const found = [...n.matchAll(re)].map(fromMatch);
  if (found.some((have) => iphoneModelsEqual(asked, have))) return true;
  const have = parseIphoneModel(variationText);
  return have ? iphoneModelsEqual(asked, have) : false;
}

/** Samsung board code: A135F / A137F / SM-A137F — not Apple A1466. */
export function extractSamsungBoardCodes(text: string | undefined): string[] {
  const raw = text ?? "";
  const n = hay(raw);
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (code: string) => {
    const id = code.toUpperCase().replace(/^SM-/, "");
    if (!/^A\d{3}[A-Z]$/.test(id)) return;
    if (seen.has(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const m of n.matchAll(/\b(?:sm\s*)?(a\d{3}[a-z])\b/g)) {
    add(m[1] ?? "");
  }
  for (const m of n.matchAll(/modele\s*(a?\d{3}[a-z])\b/g)) {
    const g = (m[1] ?? "").replace(/^a/, "a");
    add(g.startsWith("a") ? g : `a${g}`);
  }
  return out;
}

export function extractSamsungBoardCode(
  text: string | undefined,
): string | null {
  return extractSamsungBoardCodes(text)[0] ?? null;
}

/** "Galaxy A13 4G" when no board code is present. */
export function extractSamsungModelLabel(
  text: string | undefined,
): string | null {
  const raw = (text ?? "").trim();
  if (!raw) return null;
  const board = extractSamsungBoardCode(raw);
  if (board) return board;
  if (!/\b(samsung|galaxy)\b/i.test(raw)) return null;
  const a = raw.match(/\ba\s*(\d{1,2})(?:\s*(4g|5g))?\b/i);
  if (!a) return null;
  const gen = `Galaxy A${a[1]}`;
  return a[2] ? `${gen} ${a[2].toUpperCase()}` : gen;
}

export function askedSamsungSkuDiffersFromListing(
  message: string | undefined,
  listingTitle: string | undefined,
): boolean {
  const asked = extractSamsungBoardCode(message);
  if (!asked) return false;
  const have = extractSamsungBoardCodes(listingTitle);
  if (have.length === 0) return false;
  return !have.includes(asked);
}

export function detectPhoneBrand(
  text: string | undefined,
): "iphone" | "samsung" | "xiaomi" | "other" | null {
  const n = hay(text ?? "");
  if (!n) return null;
  if (/\b(samsung|galaxy)\b/.test(n)) return "samsung";
  if (/\biphone\b/.test(n)) return "iphone";
  if (/\b(xiaomi|redmi)\b/.test(n)) return "xiaomi";
  if (/\b(huawei|honor|oppo|oneplus|pixel)\b/.test(n)) return "other";
  return null;
}

/** Samsung ask must not match an iPhone listing (and vice versa). */
export function phoneBrandsClash(
  asked: string | undefined,
  listing: string | undefined,
): boolean {
  const a = detectPhoneBrand(asked);
  const b = detectPhoneBrand(listing);
  if (!a || !b) return false;
  return a !== b;
}
