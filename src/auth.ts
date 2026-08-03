import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import open from "open";
import { isMainModule } from "./cli/isMain.js";
import { config } from "./config.js";
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  extractCode,
} from "./ebay/oauth.js";
import { upsertEnv } from "./env.js";

async function main(): Promise<void> {
  const authorizeUrl = buildAuthorizeUrl();

  console.log(`\n=== eBay OAuth (${config.env}) ===\n`);
  console.log("1) Une fenêtre navigateur va s'ouvrir.");
  console.log(
    config.env === "production"
      ? "2) Connecte-toi avec ton compte eBay Production et accepte."
      : "2) Connecte-toi avec un compte Sandbox eBay et accepte.",
  );
  console.log(
    "3) Sur la page de succès, copie l'URL complète (ou juste le paramètre code=...).\n",
  );
  console.log("URL d'autorisation :");
  console.log(authorizeUrl);
  console.log("");

  await open(authorizeUrl);

  const rl = createInterface({ input, output });
  const raw = await rl.question("Colle ici l'URL (ou le code) : ");
  rl.close();

  const code = extractCode(raw);
  if (!code) {
    throw new Error("Aucun code d'autorisation fourni.");
  }

  console.log("\nÉchange du code contre un User Access Token...");
  const tokens = await exchangeCodeForTokens(code);

  upsertEnv({
    EBAY_USER_ACCESS_TOKEN: tokens.access_token,
    EBAY_USER_REFRESH_TOKEN: tokens.refresh_token ?? "",
  });

  console.log("\nOK — tokens enregistrés dans .env");
  console.log(`Access token expire dans ~${tokens.expires_in}s`);
  if (tokens.refresh_token) {
    console.log("Refresh token enregistré.");
  }
  console.log("\nAstuce SaaS : connecte eBay depuis /settings/connections dans le web.");
  console.log("Prochaine commande CLI : npm run conversations");
}

if (isMainModule(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
