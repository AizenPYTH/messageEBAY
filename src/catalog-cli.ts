import "dotenv/config";
import { importCatalogFromCsvFile } from "./catalog/importCsv.js";
import { syncSellerCatalogFromApi } from "./catalog/syncFromApi.js";

async function main(): Promise<void> {
  const [, , cmd, ...rest] = process.argv;

  if (cmd === "import-csv") {
    const filePath = rest[0];
    const username = rest[1] ?? process.env.EBAY_SELLER_USERNAME ?? "snowwolfsas";
    if (!filePath) {
      console.error(
        "Usage: npx tsx src/catalog-cli.ts import-csv <path.csv> [sellerUsername]",
      );
      process.exit(1);
    }
    const result = await importCatalogFromCsvFile({
      sellerUsername: username,
      filePath,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === "sync-api") {
    const username = rest[0] ?? process.env.EBAY_SELLER_USERNAME ?? "snowwolfsas";
    const startPage = Number(rest[1] ?? "1") || 1;
    const maxPages = Number(rest[2] ?? "3") || 3;
    const result = await syncSellerCatalogFromApi({
      sellerUsername: username,
      startPage,
      maxPages,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.error(`Unknown command: ${cmd ?? "(none)"}
Commands:
  import-csv <path.csv> [sellerUsername]
  sync-api [sellerUsername] [startPage] [maxPages]`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
