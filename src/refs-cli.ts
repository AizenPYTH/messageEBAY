/**
 * Product reference tool.
 *
 *   npm run refs -- A137F A1989        what these codes are
 *   npm run refs -- --gaps             codes in your catalogue we cannot name
 *   npm run refs -- --gaps --learn     ask eBay about them and save the answers
 *   npm run refs -- --list             everything learned so far
 *
 * Nothing here runs while answering buyers: it fills the table ahead of time so
 * the matcher can say "oui" where it would otherwise have to stay silent.
 */

import "dotenv/config";
import { getSellerByUsername } from "./database/repositories/sellers.js";
import { listCatalogListingsForSeller } from "./database/repositories/listings.js";
import {
  listProductReferences,
  upsertProductReference,
} from "./database/repositories/productReferences.js";
import { extractModelCodes } from "./product/identity.js";
import { loadReferenceCache } from "./product/referenceCache.js";
import { referenceForCode, registerReference } from "./product/references.js";
import { resolveCodeFromMarketplace } from "./product/referenceLookup.js";

function sellerUsername(): string {
  const name = process.env.EBAY_SELLER_USERNAME?.trim();
  if (!name) {
    throw new Error("EBAY_SELLER_USERNAME manquant (ou passer des codes en argument)");
  }
  return name;
}

/** Every service code that appears anywhere in the seller's own catalogue. */
async function catalogueCodes(): Promise<Map<string, string>> {
  const seller = await getSellerByUsername(sellerUsername());
  if (!seller) throw new Error(`vendeur inconnu : ${sellerUsername()}`);
  const rows = await listCatalogListingsForSeller(seller.id, { limit: 5000 });
  const codes = new Map<string, string>();
  for (const row of rows) {
    const text = `${row.title ?? ""} ${row.search_text ?? ""}`;
    for (const code of extractModelCodes(text)) {
      if (!codes.has(code)) codes.set(code, row.title ?? row.item_id);
    }
  }
  return codes;
}

async function showCodes(codes: string[]): Promise<void> {
  await loadReferenceCache();
  for (const code of codes) {
    const known = referenceForCode(code);
    if (known) {
      console.log(`${code.padEnd(10)} ${known.label}  (${known.source ?? "table"})`);
      continue;
    }
    console.log(`${code.padEnd(10)} inconnu — recherche sur eBay…`);
    const resolved = await resolveCodeFromMarketplace(code);
    if (!resolved) {
      console.log(`${" ".repeat(10)} le marché ne tranche pas — on restera silencieux sur ce code`);
      continue;
    }
    console.log(
      `${" ".repeat(10)} → ${resolved.reference.label} (${Math.round(resolved.confidence * 100)} % d'accord)`,
    );
    for (const sample of resolved.samples) {
      console.log(`${" ".repeat(12)} · ${sample}`);
    }
  }
}

async function reportGaps(learn: boolean): Promise<void> {
  await loadReferenceCache();
  const codes = await catalogueCodes();
  const missing = [...codes.entries()].filter(([code]) => !referenceForCode(code));

  console.log(`${codes.size} codes dans le catalogue, ${missing.length} sans référence.`);
  if (missing.length === 0) return;

  let learned = 0;
  for (const [code, title] of missing) {
    if (!learn) {
      console.log(`  ${code.padEnd(10)} ${title}`);
      continue;
    }
    const resolved = await resolveCodeFromMarketplace(code);
    if (!resolved) {
      console.log(`  ${code.padEnd(10)} non tranché — ${title}`);
      continue;
    }
    registerReference(resolved.reference);
    await upsertProductReference({
      reference: resolved.reference,
      confidence: resolved.confidence,
      samples: resolved.samples,
    });
    learned += 1;
    console.log(
      `  ${code.padEnd(10)} → ${resolved.reference.label} (${Math.round(resolved.confidence * 100)} %)`,
    );
  }
  if (learn) console.log(`\n${learned}/${missing.length} codes appris et enregistrés.`);
}

async function listLearned(): Promise<void> {
  const references = await listProductReferences();
  if (references.length === 0) {
    console.log("Rien d'appris pour l'instant (npm run refs -- --gaps --learn).");
    return;
  }
  for (const reference of references) {
    console.log(`${reference.code.padEnd(10)} ${reference.label}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const codes = args.filter((a) => !a.startsWith("--"));

  if (flags.has("--list")) return listLearned();
  if (flags.has("--gaps")) return reportGaps(flags.has("--learn"));
  if (codes.length > 0) return showCodes(codes);

  console.log(
    [
      "Usage :",
      "  npm run refs -- A137F A1989     ce que sont ces codes",
      "  npm run refs -- --gaps          codes du catalogue sans référence",
      "  npm run refs -- --gaps --learn  les demander à eBay et les enregistrer",
      "  npm run refs -- --list          tout ce qui a été appris",
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
