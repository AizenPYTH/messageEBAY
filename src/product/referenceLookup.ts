/**
 * Learn what a service code is from the marketplace itself.
 *
 * A code the curated table does not carry makes the bot abstain on a question
 * it could have answered. Rather than guess, we ask eBay: search the code,
 * read how hundreds of listings title it, and keep the reading only if the
 * marketplace agrees with itself.
 *
 * This never runs while answering a buyer. It fills the table ahead of time
 * (`npm run refs -- --gaps`), results are cached in the database, and a wrong
 * or missing answer costs a silence, not a wrong reply.
 */

import { searchMarketplace } from "../ebay/browseApi.js";
import type { BrowseSearchResult } from "../ebay/browseApi.js";
import { extractProductIdentities, type ProductIdentity } from "./identity.js";
import {
  registerReference,
  referenceForCode,
  type ProductReference,
} from "./references.js";

export type ResolvedReference = {
  reference: ProductReference;
  /** Share of usable titles that agreed, 0-1. */
  confidence: number;
  /** Titles the reading came from, for a human to sanity-check. */
  samples: string[];
};

/** Below this, the marketplace does not agree enough to be worth recording. */
const MIN_TITLES = 3;
const MIN_AGREEMENT = 0.6;

function identityKey(identity: ProductIdentity): string {
  return [
    identity.brand ?? "",
    identity.family ?? "",
    identity.base ?? "",
    identity.qualifiers.join(" "),
    identity.network ?? "",
  ].join("|");
}

/**
 * Read a code's product from how the marketplace titles it.
 * Returns null when the answer is not clear enough to record.
 */
export async function resolveCodeFromMarketplace(
  code: string,
  options?: {
    limit?: number;
    timeoutMs?: number;
    /** Test seam — inject a marketplace search. */
    search?: (input: { query: string; limit?: number }) => Promise<BrowseSearchResult>;
  },
): Promise<ResolvedReference | null> {
  const search = await (options?.search ?? searchMarketplace)({
    query: code,
    limit: options?.limit ?? 30,
    ...(options?.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
  });
  if (!search.ok) return null;

  const tally = new Map<
    string,
    { identity: ProductIdentity; count: number; samples: string[] }
  >();
  let usable = 0;

  for (const item of search.items) {
    const title = item.title?.trim();
    if (!title) continue;
    // Only titles that actually carry the code describe that code.
    if (!new RegExp(code.replace(/[^A-Za-z0-9]/g, ""), "i").test(title.replace(/[^A-Za-z0-9]/g, ""))) {
      continue;
    }
    const named = extractProductIdentities(title).filter(
      (identity) => identity.family && identity.base,
    );
    if (named.length !== 1) continue; // a multi-model title settles nothing
    const identity = named[0]!;
    usable += 1;
    const key = identityKey(identity);
    const entry = tally.get(key) ?? { identity, count: 0, samples: [] };
    entry.count += 1;
    if (entry.samples.length < 3) entry.samples.push(title);
    tally.set(key, entry);
  }

  if (usable < MIN_TITLES) return null;
  const best = [...tally.values()].sort((a, b) => b.count - a.count)[0];
  if (!best) return null;

  const confidence = best.count / usable;
  if (confidence < MIN_AGREEMENT) return null;

  const identity = best.identity;
  if (!identity.brand || !identity.family || !identity.base) return null;

  return {
    reference: {
      code: code.toUpperCase().replace(/^SM-?/, ""),
      source: "marketplace",
      brand: identity.brand,
      family: identity.family,
      base: identity.base,
      ...(identity.qualifiers.length ? { qualifiers: identity.qualifiers } : {}),
      ...(identity.network ? { network: identity.network } : {}),
      label: identity.label,
    },
    confidence,
    samples: best.samples,
  };
}

/**
 * Resolve a code, curated table first. Records what it learns so the rest of
 * the process compares against it.
 */
export async function ensureReference(
  code: string,
  options?: { timeoutMs?: number },
): Promise<ProductReference | null> {
  const known = referenceForCode(code);
  if (known) return known;
  const resolved = await resolveCodeFromMarketplace(code, options ?? {});
  if (!resolved) return null;
  registerReference(resolved.reference);
  return resolved.reference;
}
