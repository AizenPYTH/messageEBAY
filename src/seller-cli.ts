import "dotenv/config";
import {
  getSellerProfileBundle,
  initDefaultSellerProfile,
} from "./seller/index.js";

function resolveUsername(): string {
  const fromArg = process.argv[2]?.trim();
  const fromEnv = process.env.EBAY_SELLER_USERNAME?.trim();
  return fromArg || fromEnv || "snowwolfsas";
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

async function main(): Promise<void> {
  const script = process.env.npm_lifecycle_event;
  const username = resolveUsername();

  if (script === "seller:init") {
    await initProfile(username);
    return;
  }

  await showProfile(username);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
