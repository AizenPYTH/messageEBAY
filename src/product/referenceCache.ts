/**
 * Load the learned references into the process before it answers anything.
 *
 * Matching is synchronous by design — a buyer's reply must not wait on a
 * database round trip — so what the marketplace taught us is loaded once at
 * startup and kept in memory. A failure here costs precision, never
 * correctness: without the cache the matcher simply abstains more often.
 */

import { listProductReferences } from "../database/repositories/productReferences.js";
import { registerReference } from "./references.js";

let loaded = false;

export async function loadReferenceCache(): Promise<number> {
  if (loaded) return 0;
  try {
    const references = await listProductReferences();
    for (const reference of references) registerReference(reference);
    loaded = true;
    return references.length;
  } catch {
    // Table missing or database unreachable — the curated table still works.
    loaded = true;
    return 0;
  }
}

/** Test seam. */
export function resetReferenceCache(): void {
  loaded = false;
}
