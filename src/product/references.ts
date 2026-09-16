/**
 * Service-code reference: what a manufacturer code actually is.
 *
 * Titles do not always print the code, and a product name does not always pin
 * one down: "Galaxy A13 4G" covers both A135F and A137F, and "MacBook Pro 13"
 * spans seven different screens. Without this table the only safe answer to a
 * coded question on an uncoded listing is silence; with it, the cases where the
 * name does pin down a single code can still be answered "oui".
 *
 * The table only ever makes the system MORE precise. A code it does not know
 * falls back to abstaining, never to guessing — so adding rows is always safe,
 * and a missing row costs a reply, not a wrong one.
 *
 * `npm run refs -- <code…>` reports what is known, and `npm run refs -- --gaps`
 * lists the codes seen in the seller's own catalogue that are still missing.
 */

import type { ProductBrand, ProductIdentity } from "./identity.js";
import { codesMatch, extractModelCodes } from "./identity.js";

export type ProductReference = {
  /** Canonical code, uppercase, without the SM- prefix. */
  code: string;
  /** Where the row came from: the curated table, or the marketplace. */
  source?: "table" | "marketplace";
  brand: ProductBrand;
  family: string;
  base: string;
  qualifiers?: string[];
  network?: "4g" | "5g";
  label: string;
};

function samsung(
  code: string,
  base: string,
  label: string,
  extra: { family?: string; qualifiers?: string[]; network?: "4g" | "5g" } = {},
): ProductReference {
  return {
    code,
    brand: "samsung",
    family: extra.family ?? "galaxy",
    base,
    ...(extra.qualifiers ? { qualifiers: extra.qualifiers } : {}),
    ...(extra.network ? { network: extra.network } : {}),
    label,
  };
}

function apple(
  code: string,
  family: string,
  base: string,
  label: string,
): ProductReference {
  return { code, brand: "apple", family, base, label };
}

/**
 * Curated, not exhaustive. Ordered by family so gaps are easy to spot.
 */
export const PRODUCT_REFERENCES: ProductReference[] = [
  // ---- Samsung Galaxy A ----
  samsung("A105F", "a10", "Galaxy A10"),
  samsung("A107F", "a10s", "Galaxy A10s"),
  samsung("A115F", "a11", "Galaxy A11"),
  samsung("A125F", "a12", "Galaxy A12"),
  samsung("A127F", "a12", "Galaxy A12 Nacho"),
  samsung("A135F", "a13", "Galaxy A13 4G", { network: "4g" }),
  samsung("A137F", "a13", "Galaxy A13 4G", { network: "4g" }),
  samsung("A136B", "a13", "Galaxy A13 5G", { network: "5g" }),
  samsung("A145F", "a14", "Galaxy A14 4G", { network: "4g" }),
  samsung("A146B", "a14", "Galaxy A14 5G", { network: "5g" }),
  samsung("A202F", "a20e", "Galaxy A20e"),
  samsung("A205F", "a20", "Galaxy A20"),
  samsung("A217F", "a21s", "Galaxy A21s"),
  samsung("A225F", "a22", "Galaxy A22 4G", { network: "4g" }),
  samsung("A226B", "a22", "Galaxy A22 5G", { network: "5g" }),
  samsung("A235F", "a23", "Galaxy A23 4G", { network: "4g" }),
  samsung("A236B", "a23", "Galaxy A23 5G", { network: "5g" }),
  samsung("A305F", "a30", "Galaxy A30"),
  samsung("A307F", "a30s", "Galaxy A30s"),
  samsung("A315F", "a31", "Galaxy A31"),
  samsung("A325F", "a32", "Galaxy A32 4G", { network: "4g" }),
  samsung("A326B", "a32", "Galaxy A32 5G", { network: "5g" }),
  samsung("A336B", "a33", "Galaxy A33 5G", { network: "5g" }),
  samsung("A346B", "a34", "Galaxy A34 5G", { network: "5g" }),
  samsung("A405F", "a40", "Galaxy A40"),
  samsung("A415F", "a41", "Galaxy A41"),
  samsung("A426B", "a42", "Galaxy A42 5G", { network: "5g" }),
  samsung("A505F", "a50", "Galaxy A50"),
  samsung("A507F", "a50s", "Galaxy A50s"),
  samsung("A515F", "a51", "Galaxy A51"),
  samsung("A525F", "a52", "Galaxy A52 4G", { network: "4g" }),
  samsung("A526B", "a52", "Galaxy A52 5G", { network: "5g" }),
  samsung("A528B", "a52s", "Galaxy A52s 5G", { network: "5g" }),
  samsung("A536B", "a53", "Galaxy A53 5G", { network: "5g" }),
  samsung("A546B", "a54", "Galaxy A54 5G", { network: "5g" }),
  samsung("A705F", "a70", "Galaxy A70"),
  samsung("A715F", "a71", "Galaxy A71"),
  samsung("A725F", "a72", "Galaxy A72"),
  samsung("A736B", "a73", "Galaxy A73 5G", { network: "5g" }),

  // ---- Samsung Galaxy S ----
  samsung("G970F", "s10e", "Galaxy S10e"),
  samsung("G973F", "s10", "Galaxy S10"),
  samsung("G975F", "s10", "Galaxy S10+", { qualifiers: ["plus"] }),
  samsung("G980F", "s20", "Galaxy S20"),
  samsung("G985F", "s20", "Galaxy S20+", { qualifiers: ["plus"] }),
  samsung("G988B", "s20", "Galaxy S20 Ultra", { qualifiers: ["ultra"] }),
  samsung("G991B", "s21", "Galaxy S21"),
  samsung("G996B", "s21", "Galaxy S21+", { qualifiers: ["plus"] }),
  samsung("G998B", "s21", "Galaxy S21 Ultra", { qualifiers: ["ultra"] }),
  samsung("S901B", "s22", "Galaxy S22"),
  samsung("S906B", "s22", "Galaxy S22+", { qualifiers: ["plus"] }),
  samsung("S908B", "s22", "Galaxy S22 Ultra", { qualifiers: ["ultra"] }),
  samsung("S911B", "s23", "Galaxy S23"),
  samsung("S916B", "s23", "Galaxy S23+", { qualifiers: ["plus"] }),
  samsung("S918B", "s23", "Galaxy S23 Ultra", { qualifiers: ["ultra"] }),

  // ---- Samsung Galaxy Note ----
  samsung("N960F", "9", "Galaxy Note 9", { family: "galaxy note" }),
  samsung("N970F", "10", "Galaxy Note 10", { family: "galaxy note" }),
  samsung("N975F", "10", "Galaxy Note 10+", {
    family: "galaxy note",
    qualifiers: ["plus"],
  }),
  samsung("N980F", "20", "Galaxy Note 20", { family: "galaxy note" }),
  samsung("N986B", "20", "Galaxy Note 20 Ultra", {
    family: "galaxy note",
    qualifiers: ["ultra"],
  }),

  // ---- Apple MacBook ----
  apple("A1465", "macbook air", "11", "MacBook Air 11 (2012-2015)"),
  apple("A1466", "macbook air", "13", "MacBook Air 13 (2013-2017)"),
  apple("A1932", "macbook air", "13", "MacBook Air 13 (2018-2019)"),
  apple("A2179", "macbook air", "13", "MacBook Air 13 (2020)"),
  apple("A2337", "macbook air", "13", "MacBook Air 13 M1 (2020)"),
  apple("A2681", "macbook air", "13", "MacBook Air 13 M2 (2022)"),
  apple("A1706", "macbook pro", "13", "MacBook Pro 13 Touch Bar (2016-2017)"),
  apple("A1708", "macbook pro", "13", "MacBook Pro 13 sans Touch Bar (2016-2017)"),
  apple("A1989", "macbook pro", "13", "MacBook Pro 13 Touch Bar (2018-2019)"),
  apple("A2159", "macbook pro", "13", "MacBook Pro 13 (2019)"),
  apple("A2251", "macbook pro", "13", "MacBook Pro 13 (2020)"),
  apple("A2289", "macbook pro", "13", "MacBook Pro 13 (2020)"),
  apple("A2338", "macbook pro", "13", "MacBook Pro 13 M1/M2 (2020-2022)"),
  apple("A1707", "macbook pro", "15", "MacBook Pro 15 (2016-2017)"),
  apple("A1990", "macbook pro", "15", "MacBook Pro 15 (2018-2019)"),
  apple("A2141", "macbook pro", "16", "MacBook Pro 16 (2019)"),
  apple("A2485", "macbook pro", "16", "MacBook Pro 16 (2021)"),
  apple("A2442", "macbook pro", "14", "MacBook Pro 14 (2021)"),
];

function productKey(input: {
  brand?: ProductBrand;
  family?: string;
  base?: string;
  qualifiers?: string[];
  network?: "4g" | "5g";
}): string {
  return [
    input.brand ?? "",
    input.family ?? "",
    input.base ?? "",
    (input.qualifiers ?? []).join(" "),
    input.network ?? "",
  ]
    .join("|")
    .toLowerCase();
}

const BY_CODE = new Map<string, ProductReference>();
const BY_PRODUCT = new Map<string, ProductReference[]>();

function index(reference: ProductReference): void {
  BY_CODE.set(reference.code.toUpperCase(), reference);
  const key = productKey(reference);
  const current = BY_PRODUCT.get(key) ?? [];
  if (!current.some((r) => r.code === reference.code)) {
    BY_PRODUCT.set(key, [...current, reference]);
  }
}

for (const reference of PRODUCT_REFERENCES) {
  index({ source: "table", ...reference });
}

/** Codes learned from the marketplace, kept apart from the curated ones. */
const LEARNED = new Map<string, ProductReference>();

/**
 * Add a code the curated table does not carry. Learned rows behave exactly like
 * curated ones for matching: they can only make a name less ambiguous, never
 * turn an unknown into a guess.
 */
export function registerReference(reference: ProductReference): void {
  const code = reference.code.toUpperCase().replace(/^SM-?/, "");
  if (BY_CODE.has(code) && BY_CODE.get(code)?.source === "table") return;
  const row: ProductReference = { ...reference, code, source: "marketplace" };
  LEARNED.set(code, row);
  index(row);
}

export function learnedReferences(): ProductReference[] {
  return [...LEARNED.values()];
}

/** Test seam — drop everything learned at runtime. */
export function clearLearnedReferences(): void {
  for (const reference of LEARNED.values()) {
    BY_CODE.delete(reference.code);
    const key = productKey(reference);
    BY_PRODUCT.set(
      key,
      (BY_PRODUCT.get(key) ?? []).filter((r) => r.code !== reference.code),
    );
  }
  LEARNED.clear();
}

function allReferences(): ProductReference[] {
  return [...PRODUCT_REFERENCES, ...LEARNED.values()];
}

/** Tolerates "SM-A137F" and the buyer's truncated "137F". */
export function referenceForCode(code: string): ProductReference | null {
  const exact = BY_CODE.get(code.toUpperCase().replace(/^SM-?/, ""));
  if (exact) return exact;
  for (const reference of allReferences()) {
    if (codesMatch(reference.code, code)) return reference;
  }
  return null;
}

/**
 * Every code sold under this product name. Two or more means the name alone
 * cannot answer a coded question.
 */
export function codesForProduct(input: {
  brand?: ProductBrand;
  family?: string;
  base?: string;
  qualifiers?: string[];
  network?: "4g" | "5g";
}): string[] {
  const exact = BY_PRODUCT.get(productKey(input));
  if (exact) return exact.map((r) => r.code);
  // A name without the network qualifier covers both: "Galaxy A13" is A13 4G
  // and A13 5G at once.
  if (!input.network) {
    const loose = allReferences().filter(
      (r) =>
        r.brand === input.brand &&
        r.family === input.family &&
        r.base === input.base &&
        (r.qualifiers ?? []).join(" ") === (input.qualifiers ?? []).join(" "),
    );
    return loose.map((r) => r.code);
  }
  return [];
}

/** The product a code identifies, as an identity the matcher can compare. */
export function identityForCode(code: string): ProductIdentity | null {
  const reference = referenceForCode(code);
  if (!reference) return null;
  return {
    brand: reference.brand,
    family: reference.family,
    base: reference.base,
    qualifiers: reference.qualifiers ?? [],
    ...(reference.network ? { network: reference.network } : {}),
    codes: [reference.code],
    label: reference.label,
  };
}

/** Codes present in a text that this table does not know yet. */
export function unknownCodesIn(text: string): string[] {
  return extractModelCodes(text).filter((code) => !referenceForCode(code));
}
