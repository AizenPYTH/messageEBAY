/**
 * Product identity — brand + model + manufacturer code.
 *
 * Every "oui on a ça en stock" must compare what the buyer asked with what we
 * actually found. Matching on loose words ("écran") is how an iPhone link ends
 * up on a Samsung question, so the comparison here is deliberately strict:
 * when two identities are both known and differ, the answer is never "oui".
 *
 * Unknown is a first-class answer. A silence never loses a sale; a wrong link
 * does.
 */

import { codesForProduct, identityForCode } from "./references.js";

export type ProductBrand =
  | "apple"
  | "samsung"
  | "xiaomi"
  | "google"
  | "huawei"
  | "honor"
  | "oppo"
  | "oneplus"
  | "realme"
  | "vivo"
  | "sony"
  | "microsoft"
  | "lg"
  | "motorola"
  | "nokia"
  | "asus"
  | "wiko"
  | "alcatel"
  | "tcl";

export type ProductIdentity = {
  brand?: ProductBrand;
  /** "iphone", "galaxy", "redmi note", "macbook pro", "surface pro" */
  family?: string;
  /** "11", "a13", "7", "x3" */
  base?: string;
  /** Ordered significant variants: ["pro", "max"] */
  qualifiers: string[];
  /** Only when the buyer / title says it — A13 4G and A13 5G are not the same screen. */
  network?: "4g" | "5g";
  /** Manufacturer codes, uppercase: ["A137F"], ["A1989"] */
  codes: string[];
  /** Human readable, for replies and logs. */
  label: string;
};

export type IdentityComparison = "match" | "mismatch" | "unknown";

/**
 * Words that describe the part, not the product. They must never be the only
 * reason a catalog hit is returned — every screen in the shop contains "ecran".
 */
const GENERIC_PART_WORDS = new Set([
  "ecran", "ecrans", "screen", "lcd", "oled", "amoled", "display", "dalle",
  "vitre", "tactile", "digitizer", "batterie", "battery", "coque", "chassis",
  "cache", "clavier", "keyboard", "topcase", "nappe", "connecteur", "camera",
  "appareil", "photo", "haut", "parleur", "hp", "bouton", "carte", "mere",
  "motherboard", "trackpad", "touchpad", "chargeur", "charger", "cable",
  "complet", "complete", "original", "originale", "generique", "compatible",
  "neuf", "neuve", "occasion", "qualite", "grade", "avec", "sans", "pour",
  "noir", "noire", "blanc", "blanche", "bleu", "bleue", "rouge", "vert",
  "gris", "argent", "argente", "dore", "violet", "rose", "modele", "model",
  "reference", "piece", "pieces", "telephone", "smartphone", "portable",
]);

export function isGenericPartWord(token: string): boolean {
  return GENERIC_PART_WORDS.has(normalizeProductText(token));
}

export function normalizeProductText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const BRAND_WORDS: Array<[RegExp, ProductBrand]> = [
  [/\b(apple|iphone|ipad|macbook|imac|airpods)\b/, "apple"],
  [/\b(samsung|galaxy)\b/, "samsung"],
  [/\b(xiaomi|redmi|poco)\b/, "xiaomi"],
  [/\b(google|pixel)\b/, "google"],
  [/\b(huawei|mate\s*\d)\b/, "huawei"],
  [/\bhonor\b/, "honor"],
  [/\boppo\b/, "oppo"],
  [/\bone\s?plus\b/, "oneplus"],
  [/\brealme\b/, "realme"],
  [/\bvivo\b/, "vivo"],
  [/\b(sony|xperia)\b/, "sony"],
  [/\b(microsoft|surface)\b/, "microsoft"],
  [/\b(motorola|moto\s*[ge]\b)/, "motorola"],
  [/\bnokia\b/, "nokia"],
  [/\b(asus|zenfone)\b/, "asus"],
  [/\bwiko\b/, "wiko"],
  [/\balcatel\b/, "alcatel"],
  [/\btcl\b/, "tcl"],
  [/\blg\b/, "lg"],
];

export function detectBrand(text: string): ProductBrand | undefined {
  const hay = normalizeProductText(text);
  for (const [re, brand] of BRAND_WORDS) {
    if (re.test(hay)) return brand;
  }
  return undefined;
}

/** Apple Mac / iPad part numbers: A1989, A2338, A1466. */
const APPLE_CODE_RE = /\ba\d{4}[a-z]?\b/g;
/**
 * Samsung / Android service codes: SM-A137F, A137F, A135F, N975F.
 * Letter + 3 digits + 1-2 letters, which Apple's A + 4 digits never matches.
 */
const ANDROID_CODE_RE = /\b(?:sm[ -]?)?([asnmfgjet]\d{3}[a-z]{1,2})\b/g;
/** "modèle137F" — the buyer glued the word and dropped the series letter. */
const GLUED_CODE_RE = /\b(?:modele?|model|ref|reference)\s*([a-z]?\d{3}[a-z]{1,2})\b/g;

export function extractModelCodes(text: string): string[] {
  const hay = normalizeProductText(text);
  const out: string[] = [];
  const push = (code: string) => {
    const id = code.toUpperCase();
    if (!out.includes(id)) out.push(id);
  };
  for (const m of hay.matchAll(APPLE_CODE_RE)) push(m[0]);
  for (const m of hay.matchAll(ANDROID_CODE_RE)) push(m[1] ?? m[0]);
  for (const m of hay.matchAll(GLUED_CODE_RE)) push(m[1] ?? m[0]);
  return out;
}

/**
 * Codes match when one is a suffix of the other, so "SM-A137F" == "A137F"
 * and the buyer's truncated "137F" still matches "A137F".
 */
export function codesMatch(a: string, b: string): boolean {
  const x = a.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const y = b.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 4 && long.endsWith(short);
}

function brandFromCode(code: string): ProductBrand | undefined {
  if (/^A\d{4}[A-Z]?$/.test(code)) return "apple";
  if (/^[ASNMFGJET]\d{3}[A-Z]{1,2}$/.test(code)) return "samsung";
  return undefined;
}

const QUALIFIER_WORDS = ["pro", "max", "plus", "mini", "ultra", "lite", "fe"];

function readQualifiers(tail: string): string[] {
  const out: string[] = [];
  for (const word of normalizeProductText(tail).split(" ")) {
    if (QUALIFIER_WORDS.includes(word) && !out.includes(word)) out.push(word);
  }
  return out;
}

function readNetwork(text: string): "4g" | "5g" | undefined {
  const hay = normalizeProductText(text);
  if (/\b5\s?g\b/.test(hay)) return "5g";
  if (/\b4\s?g\b/.test(hay)) return "4g";
  return undefined;
}

type FamilyPattern = {
  brand: ProductBrand;
  re: RegExp;
  family: (m: RegExpMatchArray) => string;
  base: (m: RegExpMatchArray) => string;
  /** Qualifiers are read from this capture group, when present. */
  tail?: number;
};

/**
 * Ordered — the most specific family wins ("redmi note 11" before "redmi 11",
 * "ipad pro" before "ipad").
 */
const FAMILY_PATTERNS: FamilyPattern[] = [
  // Apple — the qualifier tail must be greedy or "11 Pro Max" collapses to "11 Pro".
  {
    brand: "apple",
    re: /\biphone\s*(se|xr|xs|x|\d{1,2})((?:\s+(?:pro|max|plus|mini))*)/,
    family: () => "iphone",
    base: (m) => m[1] ?? "",
    tail: 2,
  },
  {
    brand: "apple",
    re: /\bipad\s*(air|pro|mini)?\s*(\d{1,2})?/,
    family: (m) => (m[1] ? `ipad ${m[1]}` : "ipad"),
    base: (m) => m[2] ?? "",
  },
  {
    brand: "apple",
    re: /\bmacbook\s*(air|pro)?\s*(\d{1,2})?/,
    family: (m) => (m[1] ? `macbook ${m[1]}` : "macbook"),
    base: (m) => m[2] ?? "",
  },
  // Microsoft
  {
    brand: "microsoft",
    re: /\bsurface\s*(pro|go|book|laptop)?\s*(\d{1,2})?/,
    family: (m) => (m[1] ? `surface ${m[1]}` : "surface"),
    base: (m) => m[2] ?? "",
  },
  // Samsung — "note 10" and "tab a7" are separate families from "a10".
  {
    brand: "samsung",
    re: /\b(?:galaxy\s*)?note\s*(\d{1,2})((?:\s+(?:ultra|plus|lite|fe))*)/,
    family: () => "galaxy note",
    base: (m) => m[1] ?? "",
    tail: 2,
  },
  {
    brand: "samsung",
    re: /\b(?:galaxy\s*)?tab\s*([a-z])?\s*(\d{1,2})?/,
    family: (m) => (m[1] ? `galaxy tab ${m[1]}` : "galaxy tab"),
    base: (m) => m[2] ?? "",
  },
  {
    brand: "samsung",
    re: /\b(?:galaxy\s*)?([asmfjz])\s*(\d{1,3})((?:\s+(?:ultra|plus|lite|fe|mini))*)/,
    family: () => "galaxy",
    base: (m) => `${m[1] ?? ""}${m[2] ?? ""}`,
    tail: 3,
  },
  // Xiaomi
  {
    brand: "xiaomi",
    re: /\bredmi\s*note\s*(\d{1,2})((?:\s+(?:pro|plus|lite|max))*)/,
    family: () => "redmi note",
    base: (m) => m[1] ?? "",
    tail: 2,
  },
  {
    brand: "xiaomi",
    re: /\bredmi\s*([a-z]?\d{1,2})((?:\s+(?:pro|plus|lite|max))*)/,
    family: () => "redmi",
    base: (m) => m[1] ?? "",
    tail: 2,
  },
  {
    brand: "xiaomi",
    re: /\bpoco\s*([a-z]\d{1,2})((?:\s+(?:pro|plus|lite|max))*)/,
    family: () => "poco",
    base: (m) => m[1] ?? "",
    tail: 2,
  },
  {
    brand: "xiaomi",
    re: /\bmi\s*(\d{1,2})((?:\s+(?:pro|plus|lite|ultra))*)/,
    family: () => "mi",
    base: (m) => m[1] ?? "",
    tail: 2,
  },
  // Google
  {
    brand: "google",
    re: /\bpixel\s*(\d{1,2})((?:\s+(?:pro|xl|a))*)/,
    family: () => "pixel",
    base: (m) => m[1] ?? "",
    tail: 2,
  },
];

function buildLabel(id: Omit<ProductIdentity, "label">): string {
  const brandWord =
    id.brand === "samsung" && id.family?.startsWith("galaxy")
      ? "Samsung"
      : id.brand === "xiaomi"
        ? "Xiaomi"
        : "";
  const parts = [
    brandWord,
    id.family ? titleCaseFamily(id.family) : "",
    id.base ? id.base.toUpperCase() : "",
    ...id.qualifiers.map((q) => (q === "fe" ? "FE" : capitalize(q))),
    id.network ? id.network.toUpperCase() : "",
  ].filter(Boolean);
  const named = parts.join(" ").trim();
  if (named) return named;
  return id.codes[0] ?? "";
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function titleCaseFamily(family: string): string {
  return family
    .split(" ")
    .map((w) =>
      w === "iphone"
        ? "iPhone"
        : w === "ipad"
          ? "iPad"
          : w === "macbook"
            ? "MacBook"
            : w === "imac"
              ? "iMac"
              : capitalize(w),
    )
    .join(" ");
}

/** All products named in a piece of text — a title can list several models. */
export function extractProductIdentities(text: string): ProductIdentity[] {
  const hay = collapseSeriesLetters(normalizeProductText(text));
  const codes = extractModelCodes(hay);
  const network = readNetwork(hay);
  // The code is not a model name: without this, "A146B" reads as a Galaxy A146
  // and "(A135F)" adds a phantom A135 next to the real A13.
  const named = maskCodes(hay, codes);
  const found = parseIdentities(named, codes, network);

  // "Ecran iPhone 11 / 11 Pro / 11 Pro Max" — only the first segment repeats the
  // family, so the others are invisible without carrying it over.
  if (found.length > 0 && text.includes("/")) {
    const family = found[0]?.family;
    if (family) {
      for (const segment of text.split("/").slice(1)) {
        const segHay = maskCodes(
          collapseSeriesLetters(normalizeProductText(segment)),
          codes,
        );
        if (!segHay) continue;
        for (const extra of parseIdentities(`${family} ${segHay}`, codes, network)) {
          if (!found.some((f) => identityKey(f) === identityKey(extra))) {
            found.push(extra);
          }
        }
      }
    }
  }

  return found;
}

function identityKey(id: ProductIdentity): string {
  return `${familyKey(id)}|${id.qualifiers.join(" ")}`;
}

function parseIdentities(
  hay: string,
  codes: string[],
  network: "4g" | "5g" | undefined,
): ProductIdentity[] {
  const brandHint = detectBrand(hay);
  const found: ProductIdentity[] = [];

  for (const pattern of FAMILY_PATTERNS) {
    // A bare "a13" only means Samsung when the text says so — "A13" alone in an
    // Apple title would otherwise be read as a Galaxy.
    const needsBrandContext =
      pattern.brand === "samsung" || pattern.brand === "xiaomi";
    const brandOk =
      !needsBrandContext ||
      brandHint === pattern.brand ||
      codes.some((c) => brandFromCode(c) === pattern.brand);
    if (!brandOk) continue;
    if (brandHint && brandHint !== pattern.brand) continue;

    const global = new RegExp(pattern.re.source, "g");
    for (const m of hay.matchAll(global)) {
      const base = pattern.base(m).trim();
      const family = pattern.family(m).trim();
      if (!base && !family) continue;
      const qualifiers =
        pattern.tail != null ? readQualifiers(m[pattern.tail] ?? "") : [];
      const partial: Omit<ProductIdentity, "label"> = {
        brand: pattern.brand,
        family,
        base,
        qualifiers,
        ...(network ? { network } : {}),
        codes,
      };
      const identity: ProductIdentity = {
        ...partial,
        label: buildLabel(partial),
      };
      if (!found.some((f) => identityKey(f) === identityKey(identity))) {
        found.push(identity);
      }
    }
    if (found.length > 0) break;
  }

  if (found.length === 0 && (codes.length > 0 || brandHint)) {
    const brand = brandHint ?? (codes[0] ? brandFromCode(codes[0]) : undefined);
    const partial: Omit<ProductIdentity, "label"> = {
      ...(brand ? { brand } : {}),
      qualifiers: [],
      ...(network ? { network } : {}),
      codes,
    };
    found.push({ ...partial, label: buildLabel(partial) });
  }

  return found;
}

/** The single product a buyer is asking about, most specific wins. */
export function extractAskedIdentity(message: string): ProductIdentity | null {
  const all = extractProductIdentities(message);
  if (all.length === 0) return null;
  return [...all].sort((a, b) => specificity(b) - specificity(a))[0] ?? null;
}

function specificity(id: ProductIdentity): number {
  return (
    id.codes.length * 4 +
    (id.base ? 2 : 0) +
    id.qualifiers.length +
    (id.family ? 1 : 0)
  );
}

/**
 * Comparison key that ignores qualifiers — "iphone 11" for "iPhone 11 Pro Max".
 *
 * Empty when no model was named: "un écran A1989" identifies a product by code
 * alone, and comparing it on a brand-only key would call every Apple listing a
 * mismatch.
 */
export function familyKey(id: ProductIdentity): string {
  if (!id.family && !id.base) return "";
  return [id.brand ?? "", id.family ?? "", id.base ?? ""]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isEmptyIdentity(id: ProductIdentity | null | undefined): boolean {
  if (!id) return true;
  return !id.brand && !id.family && !id.base && id.codes.length === 0;
}

/**
 * Strict comparison. "mismatch" is a hard no: never answer "oui", never link.
 * "unknown" means we could not establish it — abstain rather than guess.
 *
 * Asked and candidate are NOT interchangeable. A buyer who names a code is
 * entitled to that exact code; a buyer who names only "MacBook Pro 13" is
 * answered by whichever MacBook Pro 13 the listing happens to be.
 */
export function compareIdentities(
  asked: ProductIdentity | null | undefined,
  candidate: ProductIdentity | null | undefined,
): IdentityComparison {
  if (isEmptyIdentity(asked) || isEmptyIdentity(candidate)) return "unknown";
  const a = asked as ProductIdentity;
  const b = candidate as ProductIdentity;

  // Brand settles it before anything else — an Apple part never answers a
  // Samsung question, whatever else the two texts share.
  if (a.brand && b.brand && a.brand !== b.brand) return "mismatch";

  // A manufacturer code is the strongest signal there is: A137F ≠ A135F.
  if (a.codes.length > 0 && b.codes.length > 0) {
    const shared = a.codes.some((x) => b.codes.some((y) => codesMatch(x, y)));
    return shared ? "match" : "mismatch";
  }

  // The buyer named a code and the listing does not print one. The product
  // name alone usually cannot answer that.
  if (a.codes.length > 0) return compareCodeToNamedProduct(a, b);

  return compareNamedProducts(a, b);
}

function compareNamedProducts(
  a: ProductIdentity,
  b: ProductIdentity,
): IdentityComparison {
  const keyA = familyKey(a);
  const keyB = familyKey(b);
  if (keyA && keyB && keyA !== keyB) return "mismatch";
  if (!keyA || !keyB) return "unknown";

  // iPhone 11 ≠ 11 Pro ≠ 11 Pro Max.
  if (a.qualifiers.join(" ") !== b.qualifiers.join(" ")) return "mismatch";

  // A13 4G and A13 5G take different screens, but only judge it when both say.
  if (a.network && b.network && a.network !== b.network) return "mismatch";

  return "match";
}

/**
 * "Avez-vous l'écran A137F ?" against a listing titled only "Galaxy A13 4G".
 *
 * The name is answerable only when it belongs to exactly one code. "Galaxy A13
 * 4G" is A135F *and* A137F, and "MacBook Pro 13" is seven different screens —
 * in those cases the honest answer is that we do not know.
 */
function compareCodeToNamedProduct(
  asked: ProductIdentity,
  candidate: ProductIdentity,
): IdentityComparison {
  // Fill in the product the code stands for when the buyer did not name it.
  const askedProduct =
    asked.family || asked.base
      ? asked
      : (asked.codes.map(identityForCode).find(Boolean) ?? asked);

  const named = compareNamedProducts(askedProduct, candidate);
  if (named === "mismatch") return "mismatch";

  const siblings = codesForProduct({
    ...(candidate.brand ? { brand: candidate.brand } : {}),
    ...(candidate.family ? { family: candidate.family } : {}),
    ...(candidate.base ? { base: candidate.base } : {}),
    qualifiers: candidate.qualifiers,
    ...(candidate.network ? { network: candidate.network } : {}),
  });
  const onlyCode = siblings.length === 1 ? siblings[0] : undefined;
  if (onlyCode && asked.codes.some((code) => codesMatch(code, onlyCode))) {
    return "match";
  }
  return "unknown";
}

/**
 * Whether we may make a positive claim ("oui, on l'a") about this text.
 *
 * "Not refuted" is not the same as "confirmed". A buyer who named a service
 * code gets a yes only once the match is established; for a vague ask, a
 * listing we could not read is still fair game.
 */
export function canAssertSameProduct(
  asked: ProductIdentity | null | undefined,
  text: string | undefined,
): boolean {
  if (isEmptyIdentity(asked)) return true;
  const verdict = identityMatchesText(asked, text);
  if (verdict === "match") return true;
  if (verdict === "mismatch") return false;
  return (asked as ProductIdentity).codes.length === 0;
}

/** Compare a buyer's ask against any product named in a title / description. */
export function identityMatchesText(
  asked: ProductIdentity | null | undefined,
  text: string | undefined,
): IdentityComparison {
  if (isEmptyIdentity(asked) || !text?.trim()) return "unknown";
  const candidates = extractProductIdentities(text);
  if (candidates.length === 0) return "unknown";
  let sawUnknown = false;
  for (const candidate of candidates) {
    const verdict = compareIdentities(asked, candidate);
    if (verdict === "match") return "match";
    if (verdict === "unknown") sawUnknown = true;
  }
  return sawUnknown ? "unknown" : "mismatch";
}

/** Blank out the service codes so they cannot be read as model names. */
function maskCodes(hay: string, codes: string[]): string {
  let out = hay;
  for (const code of codes) {
    const lower = code.toLowerCase();
    out = out.split(lower).join(" ".repeat(lower.length));
  }
  return out;
}

/**
 * "Samsung a 13 4g" — buyers separate the series letter from the number, and
 * eBay titles do not.
 */
function collapseSeriesLetters(hay: string): string {
  return hay.replace(/\b([asmfjznte])\s+(\d{1,3})\b/g, "$1$2");
}

export function describeIdentity(id: ProductIdentity | null | undefined): string {
  if (!id) return "inconnu";
  const label = id.label.trim();
  if (label && id.codes.length > 0 && !label.includes(id.codes[0] ?? "")) {
    return `${label} (${id.codes.join(", ")})`;
  }
  return label || id.codes.join(", ") || "inconnu";
}
