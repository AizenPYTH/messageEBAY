/**
 * JavaScript's `\b` is ASCII-only, so it never closes a word on an accented
 * letter: `/\bétat\b/` matches "etat" and not "état". Thirteen patterns in this
 * codebase were silently dead because of it — condition questions, damage
 * claims, free-shipping asks. These tests keep them alive, and the last one
 * stops the shape coming back.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { analyzeMessage } from "./analyzeMessage.js";
import { detectAllListingTopics } from "./listingEvidence.js";
import { isPostPurchaseDamageClaim } from "./sellerCase.js";
import { asksFreeShipping } from "../shipping/shippingCost.js";
import { isTrackingRequest } from "../shipping/detectTracking.js";

describe("français accentué", () => {
  it("lit les questions telles que les clients les écrivent", () => {
    assert.deepEqual(detectAllListingTopics("En bon état ?"), ["condition"]);
    assert.deepEqual(detectAllListingTopics("ça marche ?"), ["functional"]);
    assert.ok(detectAllListingTopics("Il est débloqué ?").includes("unlocked"));
    assert.equal(isPostPurchaseDamageClaim("à l'ouverture l'écran était cassé"), true);
    assert.equal(asksFreeShipping("la livraison est à 0 € ?"), true);
    assert.equal(isTrackingRequest("Le colis n'est toujours pas arrivé"), true);
    assert.equal(analyzeMessage("un échange est possible ?").intent, "return_request");
  });
});

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

describe("garde-fou \\b + accent", () => {
  it("aucun motif ne colle \\b à une lettre accentuée", () => {
    const accent = "éèêëàâçôöûüîïÉÈÊÀÂÇÔÛÎ";
    // \b immediately before, or immediately after, an accented literal or a
    // character class containing one.
    const bad = new RegExp(
      `\\\\b(?=(?:\\[[^\\]]*[${accent}][^\\]]*\\]|[${accent}]))` +
        `|(?:\\[[^\\]]*[${accent}][^\\]]*\\]|[${accent}])\\\\b`,
      "u",
    );

    const offenders: string[] = [];
    for (const file of sourceFiles("src")) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const literal of line.match(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g) ?? []) {
          if (bad.test(literal)) {
            offenders.push(`${file}:${index + 1}  ${literal}`);
          }
        }
      });
    }

    assert.deepEqual(
      offenders,
      [],
      `\\b ne ferme pas un mot sur une lettre accentuée — utiliser (?<![\\w\\u00c0-\\u024f]) ou (?![\\w\\u00c0-\\u024f]) :\n${offenders.join("\n")}`,
    );
  });
});
