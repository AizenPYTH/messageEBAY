/**
 * Dry-run audit: what would the bot say, right now, on your real inbox?
 *
 *   npm run audit                 the 20 threads awaiting a reply
 *   npm run audit -- --limit 50   more of them
 *   npm run audit -- --all        including threads already answered
 *   npm run audit -- --json       machine-readable, for diffing between runs
 *
 * Nothing is sent. This is the step between "the tests pass" and "the autopilot
 * is live": read the column of drafts and silences against your own customers
 * before letting any of it go out.
 */

import "dotenv/config";
import { createDefaultAiEngine } from "./ai/index.js";
import { loadInboxItems, type InboxItem } from "./conversations/index.js";
import { loadReferenceCache } from "./product/referenceCache.js";

type AuditRow = {
  conversationId: string;
  buyer: string;
  listing: string;
  ask: string;
  /** Which branch decided — "catalog:direct_yes", "price:firm", "(modèle)"… */
  path: string;
  decision: "répond" | "silence" | "alerte vendeur";
  reply: string;
  reason?: string;
};

function firstLine(text: string, max = 110): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

function decisionOf(result: {
  reply: string;
  escalated?: boolean;
}): AuditRow["decision"] {
  if (result.reply.trim()) return "répond";
  return result.escalated ? "alerte vendeur" : "silence";
}

/** The deterministic branches tag themselves in userPrompt; the model path does not. */
function pathOf(userPrompt: string): string {
  const head = userPrompt.split("\n")[0]?.trim() ?? "";
  if (!head || head.startsWith("=")) return "(modèle)";
  return head.slice(0, 60);
}

async function auditOne(item: InboxItem): Promise<AuditRow> {
  const engine = createDefaultAiEngine();
  const base = {
    conversationId: item.conversationId,
    buyer: item.buyer,
    listing: firstLine(item.listingTitle ?? "", 60),
  };
  try {
    const result = await engine.run({ conversationId: item.conversationId });
    return {
      ...base,
      ask: firstLine(result.metadata.currentAskText ?? item.lastMessagePreview ?? ""),
      path: pathOf(result.userPrompt),
      decision: decisionOf(result),
      reply: result.reply.trim(),
      ...(result.responsePlan.escalationLabel
        ? { reason: result.responsePlan.escalationLabel }
        : {}),
    };
  } catch (error: unknown) {
    return {
      ...base,
      ask: firstLine(item.lastMessagePreview ?? ""),
      path: "(erreur)",
      decision: "silence",
      reply: "",
      reason: error instanceof Error ? error.message : "erreur inconnue",
    };
  }
}

function printRow(row: AuditRow, index: number): void {
  const mark =
    row.decision === "répond" ? "→" : row.decision === "alerte vendeur" ? "!" : "·";
  console.log(`\n${mark} [${index + 1}] ${row.buyer} — ${row.listing}`);
  console.log(`   demande : ${row.ask || "(vide)"}`);
  console.log(`   chemin  : ${row.path}`);
  if (row.decision === "répond") {
    for (const line of row.reply.split("\n")) {
      console.log(`   | ${line}`);
    }
  } else {
    console.log(`   ${row.decision}${row.reason ? ` — ${row.reason}` : ""}`);
  }
}

function printSummary(rows: AuditRow[]): void {
  const counts = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.decision] = (acc[row.decision] ?? 0) + 1;
    return acc;
  }, {});
  const byPath = rows.reduce<Record<string, number>>((acc, row) => {
    const key = row.path.split(":")[0] ?? row.path;
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  console.log("\n========================================");
  console.log(`${rows.length} conversations · rien n'a été envoyé`);
  for (const [decision, count] of Object.entries(counts)) {
    console.log(`  ${decision.padEnd(16)} ${count}`);
  }
  console.log("  chemins :");
  for (const [path, count] of Object.entries(byPath).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${path.padEnd(22)} ${count}`);
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const all = args.includes("--all");
  const limitArg = args.indexOf("--limit");
  const limit =
    limitArg >= 0 ? Number(args[limitArg + 1] ?? "20") || 20 : 20;

  await loadReferenceCache();
  const inbox = await loadInboxItems(Math.max(limit * 2, 50));
  const items = (all ? inbox : inbox.filter((i) => i.awaitingReply)).slice(0, limit);

  if (items.length === 0) {
    console.log("Aucune conversation à auditer.");
    return;
  }

  if (!json) {
    console.log(`Audit à blanc de ${items.length} conversations — aucun envoi.`);
  }

  const rows: AuditRow[] = [];
  for (const [index, item] of items.entries()) {
    const row = await auditOne(item);
    rows.push(row);
    if (!json) printRow(row, index);
  }

  if (json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  printSummary(rows);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
