import "dotenv/config";
import {
  applySnowolfPlaybook,
  getSellerProfileBundle,
  initDefaultSellerProfile,
} from "./seller/index.js";

function resolveUsername(): string {
  const fromArg = process.argv[2]?.trim();
  if (fromArg && fromArg !== "init" && fromArg !== "style") {
    return fromArg;
  }
  const fromEnv = process.env.EBAY_SELLER_USERNAME?.trim();
  return fromEnv || "snowwolfsas";
}

async function showProfile(username: string): Promise<void> {
  console.log("\n=== Seller Profile ===\n");
  console.log(`username=${username}\n`);

  const bundle = await getSellerProfileBundle(username);
  if (!bundle) {
    console.log("Aucun profil trouvé.");
    console.log(`Initialise avec: npm run seller:init -- ${username}`);
    process.exit(1);
  }

  const p = bundle.profile;
  console.log(`id=${p.id}`);
  console.log(`seller_id=${p.seller_id}`);
  console.log(`display_name=${p.display_name ?? "(null)"}`);
  console.log(`languages=${(p.languages ?? []).join(", ") || "(none)"}`);
  console.log(`tone=${p.tone ?? "(null)"}`);
  console.log(`response_style=${p.response_style ?? "(null)"}`);
  console.log(`shipping_policy=${p.shipping_policy ?? "(null)"}`);
  console.log(`return_policy=${p.return_policy ?? "(null)"}`);
  console.log(`refund_policy=${p.refund_policy ?? "(null)"}`);
  console.log(`negotiation_policy=${p.negotiation_policy ?? "(null)"}`);
  console.log(`signature=\n${p.signature ?? "(null)"}`);
  console.log(`custom_instructions=\n${p.custom_instructions ?? "(null)"}`);
  console.log(`created_at=${p.created_at}`);
  console.log(`updated_at=${p.updated_at}`);
  console.log("");
}

async function initProfile(username: string): Promise<void> {
  console.log("\n=== Seller Profile — init ===\n");
  console.log(`username=${username}\n`);

  const bundle = await initDefaultSellerProfile(username, username);
  console.log("Profil vendeur initialisé / mis à jour.");
  console.log(`profile_id=${bundle.profile.id}`);
  console.log(`seller_id=${bundle.seller.id}`);
  console.log(`display_name=${bundle.profile.display_name}`);
  console.log("");
  console.log(`Affiche avec: npm run seller -- ${username}`);
  console.log("");
}

async function applyStyle(username: string): Promise<void> {
  console.log("\n=== Seller Profile — apply Snowolf style ===\n");
  console.log(`username=${username}\n`);
  const bundle = await applySnowolfPlaybook(username);
  console.log("Style concis / règles litige appliqués.");
  console.log(`profile_id=${bundle.profile.id}`);
  console.log(`response_style=${bundle.profile.response_style ?? ""}`);
  console.log("");
}

async function main(): Promise<void> {
  const script = process.env.npm_lifecycle_event;
  const username = resolveUsername();
  const argCmd = process.argv[2]?.trim();

  if (script === "seller:init" || argCmd === "init") {
    await initProfile(argCmd === "init" ? resolveUsernameFromRest() : username);
    return;
  }

  if (script === "seller:style" || argCmd === "style") {
    await applyStyle(argCmd === "style" ? resolveUsernameFromRest() : username);
    return;
  }

  await showProfile(username);
}

function resolveUsernameFromRest(): string {
  const fromArg = process.argv[3]?.trim();
  const fromEnv = process.env.EBAY_SELLER_USERNAME?.trim();
  return fromArg || fromEnv || "snowwolfsas";
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
