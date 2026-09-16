/**
 * Emergency switch for auto-reply.
 *
 *   npm run autopilot:status   who is sending right now
 *   npm run autopilot:off      turn it off on EVERY profile
 *
 * Why this exists: with SKIP_AUTH the app identifies a seller by a per-browser
 * cookie, so one shop can own several profiles — one per browser, per device,
 * or per time the cookie was cleared. The toggle in the UI only turns off the
 * profile of the browser you are looking at; any other profile keeps its eBay
 * token and keeps answering. This command reaches all of them.
 */

import "dotenv/config";
import {
  disableAutopilotEverywhere,
  listAutopilotProfiles,
} from "./database/repositories/appProfiles.js";
import { getEbayConnection } from "./ebay/connectionService.js";

function describe(profile: {
  id: string;
  email?: string | null;
  display_name?: string | null;
  autopilot_last_run_at?: string | null;
  autopilot_last_run_summary?: string | null;
}): string {
  return [
    profile.id,
    profile.email ?? profile.display_name ?? "(sans nom)",
    profile.autopilot_last_run_at
      ? `dernier run ${profile.autopilot_last_run_at.slice(0, 16).replace("T", " ")}`
      : "jamais lancé",
    profile.autopilot_last_run_summary ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
}

async function status(): Promise<void> {
  const profiles = await listAutopilotProfiles();
  if (profiles.length === 0) {
    console.log("Auto-réponse : OFF sur tous les profils.");
    return;
  }

  console.log(
    `Auto-réponse ACTIVE sur ${profiles.length} profil(s) — chacun peut envoyer des messages :\n`,
  );
  for (const profile of profiles) {
    const connection = await getEbayConnection(profile.id).catch(() => null);
    const link = connection ? "eBay connecté" : "eBay NON connecté (n'enverra rien)";
    console.log(`  · ${describe(profile)}`);
    console.log(`    ${link}`);
  }
  console.log("\nPour tout couper : npm run autopilot:off");
}

async function off(): Promise<void> {
  const wereOn = await disableAutopilotEverywhere();
  if (wereOn.length === 0) {
    console.log("Auto-réponse déjà OFF partout — rien à faire.");
    return;
  }
  console.log(`Auto-réponse coupée sur ${wereOn.length} profil(s) :\n`);
  for (const profile of wereOn) console.log(`  · ${describe(profile)}`);
  console.log(
    [
      "",
      "Le cron peut encore tourner, mais il ne trouvera plus aucun profil à traiter.",
      "Pour couper aussi le cron lui-même : AUTOPILOT_ENABLED=false côté hébergeur.",
    ].join("\n"),
  );
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "status";
  if (command === "off") return off();
  if (command === "status") return status();
  console.log("Usage : npm run autopilot:status | npm run autopilot:off");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
